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
    @InjectQueue(QUEUES.ENRICHMENT) private readonly enrichmentQueue: Queue,
    @InjectQueue(QUEUES.DIGEST) private readonly digestQueue: Queue,
    @InjectQueue(QUEUES.EVENTS) private readonly eventsQueue: Queue,
    @InjectQueue(QUEUES.REPORTS) private readonly reportsQueue: Queue,
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

      await this.enrichmentQueue.add(
        JOBS.ENRICHMENT_PASS,
        { reason: 'cron', topN: 25 },
        {
          jobId: 'cron-enrichment-daily',
          repeat: { pattern: '0 8 * * *', tz: 'America/New_York' },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );

      // ROD deed/mortgage watcher — twice daily
      await this.enrichmentQueue.add(
        JOBS.ROD_WATCH,
        { reason: 'cron' },
        {
          jobId: 'cron-rod-watch',
          repeat: { pattern: '30 7,15 * * *', tz: 'America/New_York' },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );

      // Tax delinquency + distress lists — daily mid-morning
      await this.enrichmentQueue.add(
        JOBS.TAX_DELINQUENCY_SYNC,
        { reason: 'cron' },
        {
          jobId: 'cron-tax-delinquency',
          repeat: { pattern: '0 9 * * *', tz: 'America/New_York' },
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

      // M4 — Sunday evening event feed sync
      await this.eventsQueue.add(
        JOBS.EVENTS_SYNC_ALL,
        { reason: 'cron' },
        {
          jobId: 'cron-events-weekly',
          repeat: { pattern: '0 18 * * 0', tz: 'America/New_York' },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );

      // M5 — daily check for briefs 5 days before high-density events
      await this.eventsQueue.add(
        JOBS.EVENTS_AUTO_BRIEFS,
        { reason: 'cron' },
        {
          jobId: 'cron-events-briefs',
          repeat: { pattern: '0 9 * * *', tz: 'America/New_York' },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );

      // M7 — first day of quarter ~ (Jan/Apr/Jul/Oct 2nd 10:00 ET)
      await this.reportsQueue.add(
        JOBS.REPORTS_QUARTERLY,
        { reason: 'cron' },
        {
          jobId: 'cron-reports-quarterly',
          repeat: { pattern: '0 10 2 1,4,7,10 *', tz: 'America/New_York' },
          removeOnComplete: 20,
          removeOnFail: 20,
        },
      );

      this.logger.log(
        'Registered crons: parcels, enrichment, rod.watch (7:30/15:30 ET), tax.delinquency (9:00 ET), digest, events, reports',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to register cron jobs: ${message}`);
    }
  }
}
