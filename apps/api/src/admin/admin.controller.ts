import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { JOBS, QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { DigestService } from '../digest/digest.service';

@Controller('admin')
@UseGuards(ApiTokenGuard)
export class AdminController {
  constructor(
    @InjectQueue(QUEUES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUES.DIGEST) private readonly digestQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly digest: DigestService,
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

  @Get('sync-runs')
  async listSyncRuns(@Query('limit') limit?: number) {
    const take = Math.min(limit ?? 25, 100);
    return this.prisma.syncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take,
    });
  }

  @Post('digest/preview')
  previewDigest() {
    return this.digest.preview(false);
  }

  @Post('digest/send')
  async sendDigest() {
    const job = await this.digestQueue.add(
      JOBS.DIGEST_WEEKLY,
      { reason: 'manual' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return { enqueued: true, jobId: job.id, jobName: JOBS.DIGEST_WEEKLY };
  }
}