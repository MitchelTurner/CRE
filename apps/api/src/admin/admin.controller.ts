import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { JOBS, QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { DigestService } from '../digest/digest.service';
import { FeedbackTuningService } from '../scoring/feedback-tuning.service';
import { CrmSyncService } from '../leads/crm-sync.service';
import { ParcelsSyncService } from '../ingestion/parcels-sync.service';

@Controller('admin')
@UseGuards(ApiTokenGuard)
export class AdminController {
  constructor(
    @InjectQueue(QUEUES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUES.ENRICHMENT) private readonly enrichmentQueue: Queue,
    @InjectQueue(QUEUES.DIGEST) private readonly digestQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly digest: DigestService,
    private readonly feedbackTuning: FeedbackTuningService,
    private readonly crmSync: CrmSyncService,
    private readonly parcelsSync: ParcelsSyncService,
  ) {}

  @Post('sync')
  async enqueueSync() {
    const job = await this.ingestionQueue.add(
      JOBS.PARCELS_FULL_SYNC,
      { reason: 'manual' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.PARCELS_FULL_SYNC,
      note: 'Job queued — watch Recent sync runs for success/failed (full county pull can take several minutes).',
    };
  }

  @Post('enrich')
  async enqueueEnrich(@Query('topN') topN?: string) {
    const n = Math.min(Math.max(parseInt(topN ?? '25', 10) || 25, 1), 100);
    const job = await this.enrichmentQueue.add(
      JOBS.ENRICHMENT_PASS,
      { reason: 'manual', topN: n },
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
      jobName: JOBS.ENRICHMENT_PASS,
      topN: n,
      note: 'Enrichment queued (tax/distress/SoS/ROD/planning/permits/listings/probate/flood/HITL).',
    };
  }

  @Post('tune-weights')
  tuneWeights() {
    return this.feedbackTuning.tuneFromFeedback(5);
  }

  @Post('crm/sync')
  syncCrm() {
    return this.crmSync.syncEligible();
  }

  @Get('sync-runs')
  async listSyncRuns(@Query('limit') limit?: number) {
    const take = Math.min(limit ?? 25, 100);
    return this.prisma.syncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take,
    });
  }

  @Get('jobs/active')
  async activeJobs() {
    const running = await this.prisma.syncRun.findMany({
      where: { status: 'running' },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
    return { items: running };
  }

  @Get('inventory')
  inventory() {
    return this.parcelsSync.inventoryCounts();
  }

  @Post('parcels/reactivate')
  async reactivateParcels() {
    const result = await this.parcelsSync.reactivateAllCommercial();
    return {
      ...result,
      note:
        result.reactivated > 0
          ? `Reactivated ${result.reactivated} commercial parcels. Run a full sync when ready.`
          : 'No inactive commercial parcels to reactivate.',
    };
  }

  @Post('digest/preview')
  previewDigest(@Body() body?: { excludePins?: string[] }) {
    return this.digest.preview(false, { excludePins: body?.excludePins });
  }

  @Post('digest/send')
  async sendDigest(@Body() body?: { excludePins?: string[] }) {
    const job = await this.digestQueue.add(
      JOBS.DIGEST_WEEKLY,
      { reason: 'manual', excludePins: body?.excludePins ?? [] },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.DIGEST_WEEKLY,
      excluded: body?.excludePins?.length ?? 0,
      note: 'Digest queued with your include/exclude selection.',
    };
  }
}
