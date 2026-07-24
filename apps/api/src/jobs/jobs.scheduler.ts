import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOBS, QUEUES } from './queues';

/**
 * Register repeatable crons after the HTTP server is up so a Redis blip
 * during job registration cannot block /health.
 */
@Injectable()
export class JobsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsScheduler.name);

  constructor(
    @InjectQueue(QUEUES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUES.DIGEST) private readonly digestQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
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

      this.logger.log(
        'Registered cron jobs: parcels.dailySync (06:00 ET), digest.weekly (Mon 08:00 ET)',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Do not crash the web process — crons can be re-registered on next boot.
      this.logger.error(`Failed to register cron jobs: ${message}`);
    }
  }
}