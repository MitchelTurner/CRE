import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { ReportsService } from './reports.service';

@Processor(QUEUES.REPORTS)
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(private readonly reports: ReportsService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing ${job.name}`);
    if (job.name === JOBS.REPORTS_QUARTERLY) {
      return this.reports.generateQuarterly(true);
    }
    throw new Error(`Unknown reports job ${job.name}`);
  }
}
