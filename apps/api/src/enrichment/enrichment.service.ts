import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  inferMortgageMaturityDates,
  isMaturityWithinMonths,
} from '@cre/shared';
import { createSosClient, isDissolvedStatus, type SosClient } from '../clients/sos.client';
import { createRodClient, type RodClient } from '../clients/rod.client';
import { createSkipTraceClient, type SkipTraceClient } from '../clients/skiptrace.client';
import { createDistressClient, type DistressClient } from '../clients/distress.client';
import { PrismaService } from '../prisma/prisma.service';
import { SignalService } from './signal.service';

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);
  private readonly sos: SosClient;
  private readonly rod: RodClient;
  private readonly skip: SkipTraceClient;
  private readonly distress: DistressClient;
  private skipTraceUsedThisWeek = 0;
  private skipTraceWeekKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly signals: SignalService,
  ) {
    this.sos = createSosClient(process.env);
    this.rod = createRodClient(process.env);
    this.skip = createSkipTraceClient(process.env);
    this.distress = createDistressClient(process.env);
  }

  /** Derive tax_delinquent signals for all active commercial parcels from PAIDDATE. */
  async refreshTaxSignalsFromParcels(): Promise<number> {
    const parcels = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        isCommercial: true,
        totalTax: { gt: 0 },
        paidDate: null,
      },
      select: { id: true, pin: true, totalTax: true },
    });

    let n = 0;
    for (const p of parcels) {
      await this.signals.upsertSignal({
        parcelId: p.id,
        type: 'tax_delinquent',
        payload: { pin: p.pin, totalTax: p.totalTax, reason: 'paidDate_null_with_tax_due' },
      });
      n += 1;
    }
    this.logger.log(`Tax-delinquent signals upserted: ${n}`);
    return n;
  }

  async refreshDistressLists(): Promise<{ taxSale: number; foreclosure: number }> {
    const [taxSale, foreclosure] = await Promise.all([
      this.distress.fetchTaxSaleList(),
      this.distress.fetchForeclosureRoster(),
    ]);

    let taxSaleCount = 0;
    for (const hit of taxSale) {
      if (!hit.pin) continue;
      const parcel = await this.prisma.parcel.findUnique({ where: { pin: hit.pin } });
      if (!parcel) continue;
      await this.signals.upsertSignal({
        parcelId: parcel.id,
        type: 'tax_sale',
        payload: hit.payload,
      });
      taxSaleCount += 1;
    }

    let fcCount = 0;
    for (const hit of foreclosure) {
      if (!hit.pin) continue;
      const parcel = await this.prisma.parcel.findUnique({ where: { pin: hit.pin } });
      if (!parcel) continue;
      await this.signals.upsertSignal({
        parcelId: parcel.id,
        type: 'foreclosure',
        payload: hit.payload,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      });
      fcCount += 1;
    }

    return { taxSale: taxSaleCount, foreclosure: fcCount };
  }

  async enrichTopLeads(limit = 25): Promise<{
    sos: number;
    mortgages: number;
    skipTrace: number;
  }> {
    const scored = await this.prisma.parcel.findMany({
      where: { isActive: true, isCommercial: true },
      include: {
        owner: true,
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
      },
    });
    scored.sort((a, b) => (b.scores[0]?.total ?? 0) - (a.scores[0]?.total ?? 0));
    const targets = scored.slice(0, limit);

    let sos = 0;
    let mortgages = 0;
    let skipTrace = 0;

    for (const parcel of targets) {
      const owner = parcel.owner;
      if (!owner) continue;

      if (owner.isEntity) {
        const stale =
          !owner.sosFetchedAt ||
          Date.now() - owner.sosFetchedAt.getTime() > 30 * 24 * 60 * 60 * 1000;
        if (stale) {
          try {
            const entity = await this.sos.resolveEntity(owner.nameRaw);
            if (entity) {
              await this.prisma.owner.update({
                where: { id: owner.id },
                data: {
                  sosEntityId: entity.entityId ?? null,
                  sosStatus: entity.status ?? null,
                  sosRegisteredAgent: entity.registeredAgent ?? null,
                  sosAgentAddress: entity.agentAddress ?? null,
                  sosFetchedAt: new Date(),
                  sosRaw: entity.raw as Prisma.InputJsonValue,
                },
              });

              if (entity.registeredAgent) {
                await this.prisma.contact.create({
                  data: {
                    ownerId: owner.id,
                    name: entity.registeredAgent,
                    role: 'registered_agent',
                    source: 'sos',
                  },
                });
              }

              await this.signals.upsertSignal({
                parcelId: parcel.id,
                type: isDissolvedStatus(entity.status) ? 'sos_dissolved' : 'sos_resolved',
                payload: {
                  legalName: entity.legalName,
                  status: entity.status,
                  registeredAgent: entity.registeredAgent,
                  agentAddress: entity.agentAddress,
                  source: entity.source,
                },
              });
              sos += 1;
            }
          } catch (err) {
            this.logger.warn(
              `SoS resolve failed for ${owner.nameRaw}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          await sleep(400);
        }
      }

      try {
        const mtg = await this.rod.findLatestMortgage(owner.nameRaw, parcel.pin);
        if (mtg) {
          const maturities = inferMortgageMaturityDates(mtg.originationDate);
          const soon = maturities.find((m) => isMaturityWithinMonths(m, 18));
          if (soon) {
            await this.signals.upsertSignal({
              parcelId: parcel.id,
              type: 'mortgage_maturity',
              payload: {
                originationDate: mtg.originationDate.toISOString(),
                inferredMaturity: soon.toISOString(),
                mortgagee: mtg.mortgagee,
                book: mtg.book,
                page: mtg.page,
              },
              expiresAt: soon,
            });
            mortgages += 1;
          }
        }
      } catch (err) {
        this.logger.warn(
          `ROD mortgage lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (this.canSkipTrace() && (owner.sosRegisteredAgent || owner.isAbsentee)) {
        const name = owner.sosRegisteredAgent || owner.nameRaw;
        try {
          const hit = await this.skip.lookup({
            name,
            mailingAddress: owner.sosAgentAddress || owner.mailingAddress,
          });
          this.bumpSkipTrace();
          if (hit && (hit.phone || hit.email)) {
            await this.prisma.contact.create({
              data: {
                ownerId: owner.id,
                name: hit.name ?? name,
                role: owner.sosRegisteredAgent ? 'registered_agent' : 'owner',
                phone: hit.phone ?? null,
                email: hit.email ?? null,
                source: 'skiptrace',
              },
            });
            skipTrace += 1;
          }
        } catch (err) {
          this.logger.warn(
            `Skip-trace failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        await sleep(300);
      }
    }

    return { sos, mortgages, skipTrace };
  }

  async monitorRecentDeeds(): Promise<number> {
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const deeds = await this.rod.searchRecentDeeds(since);
    let n = 0;
    for (const deed of deeds) {
      if (deed.pin) {
        const parcel = await this.prisma.parcel.findUnique({ where: { pin: deed.pin } });
        if (parcel) {
          await this.signals.upsertSignal({
            parcelId: parcel.id,
            type: 'recent_seller',
            payload: {
              grantor: deed.grantor,
              grantee: deed.grantee,
              recordedAt: deed.recordedAt.toISOString(),
              book: deed.book,
              page: deed.page,
            },
            expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
          });
          n += 1;
        }
      }

      if (deed.grantor) {
        const normalized = deed.grantor
          .toUpperCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40);
        if (!normalized) continue;

        const owners = await this.prisma.owner.findMany({
          where: { nameNormalized: { contains: normalized } },
          include: {
            parcels: { where: { isActive: true, isCommercial: true }, take: 5 },
          },
          take: 3,
        });
        for (const owner of owners) {
          for (const parcel of owner.parcels) {
            await this.signals.upsertSignal({
              parcelId: parcel.id,
              type: 'recent_seller',
              payload: {
                grantor: deed.grantor,
                grantee: deed.grantee,
                recordedAt: deed.recordedAt.toISOString(),
                matchedBy: 'owner_name',
              },
              expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            });
            const exists = await this.prisma.lead.findFirst({
              where: {
                parcelId: parcel.id,
                leadType: 'exchange_buyer',
                status: { not: 'dead' },
              },
            });
            if (!exists) {
              await this.prisma.lead.create({
                data: {
                  parcelId: parcel.id,
                  status: 'new',
                  leadType: 'exchange_buyer',
                  whyNow: `Owner ${deed.grantor} recorded a commercial deed on ${deed.recordedAt.toLocaleDateString('en-US')} — possible 1031 replacement buyer (180-day clock).`,
                },
              });
            }
            n += 1;
          }
        }
      }
    }
    return n;
  }

  async runFullEnrichmentPass(topN = 25): Promise<Record<string, number>> {
    const syncRun = await this.prisma.syncRun.create({
      data: { source: 'enrichment_pass', status: 'running' },
    });
    try {
      const tax = await this.refreshTaxSignalsFromParcels();
      const distress = await this.refreshDistressLists();
      const deeds = await this.monitorRecentDeeds();
      const top = await this.enrichTopLeads(topN);
      const totals = {
        taxSignals: tax,
        taxSale: distress.taxSale,
        foreclosure: distress.foreclosure,
        recentDeeds: deeds,
        sos: top.sos,
        mortgages: top.mortgages,
        skipTrace: top.skipTrace,
      };
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          recordsSeen: topN,
          recordsUpserted: Object.values(totals).reduce((a, b) => a + b, 0),
        },
      });
      this.logger.log(`Enrichment pass complete: ${JSON.stringify(totals)}`);
      return totals;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: { status: 'failed', finishedAt: new Date(), error: message },
      });
      throw err;
    }
  }

  private canSkipTrace(): boolean {
    const cap = this.config.get<number>('skiptraceWeeklyCap') ?? 25;
    this.ensureSkipWeek();
    return this.skipTraceUsedThisWeek < cap;
  }

  private bumpSkipTrace(): void {
    this.ensureSkipWeek();
    this.skipTraceUsedThisWeek += 1;
  }

  private ensureSkipWeek(): void {
    const key = weekKey(new Date());
    if (key !== this.skipTraceWeekKey) {
      this.skipTraceWeekKey = key;
      this.skipTraceUsedThisWeek = 0;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function weekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${week}`;
}
