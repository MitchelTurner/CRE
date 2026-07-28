import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SignalSource } from './connectors/signal-source.interface';
import { UccConnector } from './connectors/ucc.connector';
import { FmcsaConnector } from './connectors/fmcsa.connector';
import { EchoConnector } from './connectors/echo.connector';
import { SbaConnector } from './connectors/sba.connector';
import { HiringConnector, ImportsConnector } from './connectors/stub.connectors';
import { EntityResolutionService } from './resolution/entity-resolution.service';
import { SpaceScoreService } from './space-score.service';

@Injectable()
export class SignalPipelineService {
  private readonly logger = new Logger(SignalPipelineService.name);
  private readonly sources: SignalSource[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolution: EntityResolutionService,
    private readonly spaceScores: SpaceScoreService,
    ucc: UccConnector,
    fmcsa: FmcsaConnector,
    echo: EchoConnector,
    sba: SbaConnector,
    imports: ImportsConnector,
    hiring: HiringConnector,
  ) {
    this.sources = [ucc, fmcsa, echo, sba, imports, hiring];
  }

  listSources() {
    return this.sources.map((s) => ({
      key: s.key,
      cadence: s.cadence,
      tier: s.tier,
    }));
  }

  getSource(key: string): SignalSource | undefined {
    return this.sources.find((s) => s.key === key);
  }

  async runConnector(
    key: string,
    since?: Date,
  ): Promise<{ seen: number; landed: number; upserted: number }> {
    const source = this.getSource(key);
    if (!source) throw new Error(`Unknown signal source: ${key}`);

    const syncRun = await this.prisma.syncRun.create({
      data: { source: `signals.${key}`, status: 'running' },
    });

    try {
      const lookback = since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const raws = await source.fetch(lookback);
      let landed = 0;
      let upserted = 0;

      for (const raw of raws) {
        const bodyHash = sha256(JSON.stringify(raw.body));
        try {
          await this.prisma.signalRaw.create({
            data: {
              source: source.key,
              sourceRef: raw.sourceRef,
              bodyHash,
              body: raw.body as Prisma.InputJsonValue,
              fetchedAt: raw.fetchedAt,
            },
          });
          landed += 1;
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            // duplicate raw — still try process if unprocessed
          } else {
            throw err;
          }
        }

        const drafts = source.normalize(raw);
        for (const draft of drafts) {
          const company = await this.resolution.resolveCompany({
            name: draft.companyName,
            source: source.key,
            dotNumber: draft.dotNumber,
            naics: draft.naics,
          });
          const site = await this.resolution.resolveSite({
            companyId: company.companyId,
            rawAddress: draft.siteAddress || draft.companyAddress,
          });

          try {
            await this.prisma.industrialSignal.upsert({
              where: {
                source_sourceRef: {
                  source: source.key,
                  sourceRef: draft.sourceRef,
                },
              },
              create: {
                type: draft.type,
                subtype: draft.subtype ?? null,
                companyId: company.companyId,
                siteId: site?.siteId ?? null,
                parcelId: site?.parcelId ?? null,
                occurredAt: draft.occurredAt,
                source: source.key,
                sourceRef: draft.sourceRef,
                weight: draft.weight,
                confidence: draft.confidence ?? 1,
                headline: draft.headline,
                payload: draft.payload as Prisma.InputJsonValue,
              },
              update: {
                subtype: draft.subtype ?? null,
                companyId: company.companyId,
                siteId: site?.siteId ?? null,
                parcelId: site?.parcelId ?? null,
                occurredAt: draft.occurredAt,
                weight: draft.weight,
                confidence: draft.confidence ?? 1,
                headline: draft.headline,
                payload: draft.payload as Prisma.InputJsonValue,
              },
            });
            upserted += 1;
            this.spaceScores.enqueue(company.companyId);
            await this.maybeAnnotateBuilding(
              draft.type,
              site?.parcelId,
              draft.payload,
              draft.headline,
            );
          } catch (err) {
            this.logger.warn(
              `Signal upsert failed ${source.key}/${draft.sourceRef}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }

        await this.prisma.signalRaw.updateMany({
          where: {
            source: source.key,
            sourceRef: raw.sourceRef,
            bodyHash,
            processedAt: null,
          },
          data: { processedAt: new Date() },
        });
      }

      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          recordsSeen: raws.length,
          recordsUpserted: upserted,
        },
      });
      this.logger.log(
        `signals.${key}: seen=${raws.length} landed=${landed} upserted=${upserted}`,
      );
      return { seen: raws.length, landed, upserted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: { status: 'failed', finishedAt: new Date(), error: message },
      });
      throw err;
    }
  }

  /** Ingest pre-normalized raw records (Admin paste / fixtures). */
  async ingestRawRecords(
    key: string,
    records: Array<{ sourceRef: string; body: unknown; fetchedAt?: string }>,
  ) {
    const source = this.getSource(key);
    if (!source) throw new Error(`Unknown signal source: ${key}`);

    let upserted = 0;
    for (const record of records) {
      const raw = {
        sourceRef: record.sourceRef,
        fetchedAt: record.fetchedAt ? new Date(record.fetchedAt) : new Date(),
        body: record.body,
      };
      const bodyHash = sha256(JSON.stringify(raw.body));
      await this.prisma.signalRaw.upsert({
        where: {
          source_sourceRef_bodyHash: {
            source: key,
            sourceRef: raw.sourceRef,
            bodyHash,
          },
        },
        create: {
          source: key,
          sourceRef: raw.sourceRef,
          bodyHash,
          body: raw.body as Prisma.InputJsonValue,
          fetchedAt: raw.fetchedAt,
        },
        update: {},
      });

      for (const draft of source.normalize(raw)) {
        const company = await this.resolution.resolveCompany({
          name: draft.companyName,
          source: key,
          dotNumber: draft.dotNumber,
          naics: draft.naics,
        });
        const site = await this.resolution.resolveSite({
          companyId: company.companyId,
          rawAddress: draft.siteAddress || draft.companyAddress,
        });
        await this.prisma.industrialSignal.upsert({
          where: {
            source_sourceRef: { source: key, sourceRef: draft.sourceRef },
          },
          create: {
            type: draft.type,
            subtype: draft.subtype ?? null,
            companyId: company.companyId,
            siteId: site?.siteId ?? null,
            parcelId: site?.parcelId ?? null,
            occurredAt: draft.occurredAt,
            source: key,
            sourceRef: draft.sourceRef,
            weight: draft.weight,
            confidence: draft.confidence ?? 1,
            headline: draft.headline,
            payload: draft.payload as Prisma.InputJsonValue,
          },
          update: {
            headline: draft.headline,
            weight: draft.weight,
            payload: draft.payload as Prisma.InputJsonValue,
            companyId: company.companyId,
            siteId: site?.siteId ?? null,
            parcelId: site?.parcelId ?? null,
          },
        });
        this.spaceScores.enqueue(company.companyId);
        await this.maybeAnnotateBuilding(
          draft.type,
          site?.parcelId,
          draft.payload,
          draft.headline,
        );
        upserted += 1;
      }
    }
    return { upserted, count: records.length };
  }

  /** Persist ECHO/env notes onto BuildingAttributes when a parcel is resolved. */
  private async maybeAnnotateBuilding(
    type: string,
    parcelId: string | null | undefined,
    payload: Record<string, unknown>,
    headline: string,
  ) {
    if (!parcelId) return;
    if (type !== 'ENV_PERMIT' && type !== 'GENERATOR_STATUS_CHANGE') return;
    const note =
      (payload.envNote != null ? String(payload.envNote) : null) || headline;
    if (!note) return;
    const existing = await this.prisma.buildingAttributes.findUnique({
      where: { parcelId },
      select: { sourceNotes: true },
    });
    const prior = existing?.sourceNotes?.trim() || '';
    if (prior.includes(note)) return;
    const merged = prior ? `${prior}\n${note}` : note;
    await this.prisma.buildingAttributes.upsert({
      where: { parcelId },
      create: { parcelId, sourceNotes: merged.slice(0, 4000) },
      update: { sourceNotes: merged.slice(0, 4000) },
    });
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
