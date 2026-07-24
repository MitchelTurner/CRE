import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { ScoringService } from './scoring.service';

@Processor(QUEUES.SCORING)
export class ScoringProcessor extends WorkerHost {
  private readonly logger = new Logger(ScoringProcessor.name);

  constructor(
    private readonly scoringService: ScoringService,
    @InjectQueue(QUEUES.ENRICHMENT) private readonly enrichmentQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} id=${job.id}`);
    if (job.name === JOBS.SCORING_RUN_ALL) {
      const result = await this.scoringService.runAll();
      const chainEnrichment = job.data?.chainEnrichment !== false;
      if (chainEnrichment) {
        await this.enrichmentQueue.add(
          JOBS.ENRICHMENT_PASS,
          { trigger: job.name, syncRunId: result.syncRunId, topN: 25 },
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 10000 },
            removeOnComplete: 50,
            removeOnFail: 50,
          },
        );
        this.logger.log(`Chained ${JOBS.ENRICHMENT_PASS} after scoring`);
      }
      return result;
    }
    throw new Error(`Unknown scoring job: ${job.name}`);
  }
}
