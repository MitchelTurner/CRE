import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { DigestService } from './digest.service';

@Processor(QUEUES.DIGEST)
export class DigestProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(private readonly digestService: DigestService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} id=${job.id}`);
    if (job.name === JOBS.DIGEST_WEEKLY) {
      const excludePins = Array.isArray(job.data?.excludePins)
        ? (job.data.excludePins as string[])
        : undefined;
      return this.digestService.sendWeekly({ excludePins });
    }
    throw new Error(`Unknown digest job: ${job.name}`);
  }
}
