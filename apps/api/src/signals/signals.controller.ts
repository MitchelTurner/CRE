import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IndustrialSignalType } from '@prisma/client';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { SignalPipelineService } from './signal-pipeline.service';
import { EntityResolutionService } from './resolution/entity-resolution.service';
import { SpaceScoreService } from './space-score.service';

@Controller('admin/signals')
@UseGuards(ApiTokenGuard)
export class SignalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: SignalPipelineService,
    private readonly resolution: EntityResolutionService,
    private readonly spaceScores: SpaceScoreService,
    @InjectQueue(QUEUES.SIGNALS) private readonly signalsQueue: Queue,
  ) {}

  @Get('sources')
  sources() {
    return this.pipeline.listSources();
  }

  @Post('run/:key')
  async enqueue(@Param('key') key: string) {
    const job = await this.signalsQueue.add(
      JOBS.SIGNALS_RUN_SOURCE,
      { sourceKey: key, reason: 'manual' },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      note: `Signal connector ${key} queued — watch Recent sync runs for signals.${key}`,
    };
  }

  @Post('ingest/:key')
  async ingest(
    @Param('key') key: string,
    @Body()
    body: {
      records: Array<{ sourceRef: string; body: unknown; fetchedAt?: string }>;
    },
  ) {
    const records = body?.records ?? [];
    if (!records.length) {
      return { upserted: 0, note: 'No records provided' };
    }
    const result = await this.pipeline.ingestRawRecords(key, records);
    return { ...result, note: `Ingested ${result.upserted} signals from ${key}` };
  }

  @Post('manual')
  async manual(
    @Body()
    body: {
      companyName: string;
      type: IndustrialSignalType;
      subtype?: string;
      headline: string;
      occurredAt?: string;
      siteAddress?: string;
      referralSource?: string;
      weight?: number;
    },
  ) {
    const company = await this.resolution.resolveCompany({
      name: body.companyName,
      source: 'manual',
    });
    const site = await this.resolution.resolveSite({
      companyId: company.companyId,
      rawAddress: body.siteAddress,
    });
    const sourceRef = `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const signal = await this.prisma.industrialSignal.create({
      data: {
        type: body.type,
        subtype: body.subtype ?? null,
        companyId: company.companyId,
        siteId: site?.siteId ?? null,
        parcelId: site?.parcelId ?? null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        source: 'manual',
        sourceRef,
        weight: body.weight ?? (body.type === 'REFERRAL' ? 25 : 20),
        headline: body.headline,
        payload: {
          referralSource: body.referralSource ?? null,
          detail: body.headline,
        },
      },
    });
    this.spaceScores.enqueue(company.companyId);
    return { signalId: signal.id, companyId: company.companyId };
  }

  @Get('movers')
  async movers(@Query('minDelta') minDelta?: string) {
    const delta = Math.max(Number(minDelta ?? '20') || 20, 1);
    const rows = await this.prisma.spaceScore.findMany({
      where: {
        previousScore: { not: null },
        bandLabel: { in: ['hot', 'warm', 'watch'] },
      },
      include: {
        company: {
          include: {
            signals: { orderBy: { occurredAt: 'desc' }, take: 3 },
          },
        },
      },
      orderBy: { score: 'desc' },
      take: 50,
    });
    return rows
      .map((r) => ({
        companyId: r.companyId,
        companyName: r.company.canonicalName,
        score: r.score,
        previousScore: r.previousScore,
        delta: r.score - (r.previousScore ?? 0),
        bandLabel: r.bandLabel,
        topSignals: r.company.signals.map((s) => ({
          id: s.id,
          type: s.type,
          subtype: s.subtype,
          headline: s.headline,
          occurredAt: s.occurredAt,
          parcelId: s.parcelId,
        })),
      }))
      .filter((r) => r.delta >= delta);
  }

  @Get('resolution-queue')
  async resolutionQueue(@Query('status') status = 'pending') {
    return this.prisma.resolutionReview.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('resolution-queue/:id/resolve')
  async resolveReview(
    @Param('id') id: string,
    @Body()
    body: {
      action: 'confirm' | 'reject' | 'create_new';
      note?: string;
      resolvedBy?: string;
    },
  ) {
    const review = await this.prisma.resolutionReview.findUnique({ where: { id } });
    if (!review) return { ok: false, note: 'Not found' };

    if (body.action === 'confirm' && review.kind === 'company' && review.candidateId && review.normalizedName) {
      await this.prisma.companyAlias.create({
        data: {
          companyId: review.candidateId,
          alias: review.rawName || review.normalizedName,
          normalizedName: review.normalizedName,
          source: 'manual',
        },
      });
    }
    if (body.action === 'confirm' && review.kind === 'site' && review.candidateId) {
      const companyId = (review.payload as { companyId?: string } | null)?.companyId;
      if (companyId && review.rawAddress) {
        await this.prisma.site.create({
          data: {
            companyId,
            parcelId: review.candidateId,
            rawAddress: review.rawAddress,
            normalized: review.normalizedName || review.rawAddress,
            matchMethod: 'manual',
            matchConf: 1,
            isPrimary: false,
          },
        });
      }
    }

    await this.prisma.resolutionReview.update({
      where: { id },
      data: {
        status: body.action === 'reject' ? 'rejected' : 'confirmed',
        note: body.note,
        resolvedAt: new Date(),
        resolvedBy: body.resolvedBy || 'agent',
      },
    });
    return { ok: true };
  }

  @Get('playbooks')
  playbooks() {
    return this.prisma.signalPlaybook.findMany({ orderBy: [{ type: 'asc' }, { subtype: 'asc' }] });
  }
}
