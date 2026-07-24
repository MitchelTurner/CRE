import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOBS, QUEUES } from './queues';

@Injectable()
export class JobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(JobsScheduler.name);

  constructor(
    @InjectQueue(QUEUES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUES.DIGEST) private readonly digestQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Daily sync 6:00 America/New_York — process TZ should be Eastern in prod
    await this.ingestionQueue.add(
      JOBS.PARCELS_DAILY_SYNC,
      { reason: 'cron' },
      {
        jobId: 'cron-parcels-daily',
        repeat: { pattern: '0 6 * * *', tz: 'America/New_York' },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );

    // Weekly digest Monday 8:00 America/New_York (UTC-ish via tz)
    await this.digestQueue.add(
      JOBS.DIGEST_WEEKLY,
      { reason: 'cron' },
      {
        jobId: 'cron-digest-weekly',
        repeat: { pattern: '0 12 * * 1', tz: 'America/New_York' },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );

    this.logger.log('Registered cron jobs: parcels.dailySync (06:00 ET), digest.weekly (Mon 08:00 ET)');
  }
}