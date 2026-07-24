import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { ScoringService } from './scoring.service';

@Processor(QUEUES.SCORING)
export class ScoringProcessor extends WorkerHost {
  private readonly logger = new Logger(ScoringProcessor.name);

  constructor(private readonly scoringService: ScoringService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} id=${job.id}`);
    if (job.name === JOBS.SCORING_RUN_ALL) {
      return this.scoringService.runAll();
    }
    throw new Error(`Unknown scoring job: ${job.name}`);
  }
}