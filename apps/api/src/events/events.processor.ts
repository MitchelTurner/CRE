import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { EventSyncService } from './event-sync.service';
import { BriefService } from './brief.service';

@Processor(QUEUES.EVENTS)
export class EventsProcessor extends WorkerHost {
  private readonly logger = new Logger(EventsProcessor.name);

  constructor(
    private readonly sync: EventSyncService,
    private readonly briefs: BriefService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing ${job.name}`);
    if (job.name === JOBS.EVENTS_SYNC_ALL) {
      return this.sync.syncAll();
    }
    if (job.name === JOBS.EVENTS_AUTO_BRIEFS) {
      return { generated: await this.briefs.autoGenerateUpcoming() };
    }
    if (job.name === JOBS.REPORTS_QUARTERLY) {
      // handled by reports processor if separate; keep for fan-in flexibility
      return { skipped: true };
    }
    throw new Error(`Unknown events job ${job.name}`);
  }
}
