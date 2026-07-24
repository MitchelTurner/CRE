import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { EnrichmentService } from './enrichment.service';

@Processor(QUEUES.ENRICHMENT)
export class EnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichmentProcessor.name);

  constructor(
    private readonly enrichment: EnrichmentService,
    @InjectQueue(QUEUES.SCORING) private readonly scoringQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} id=${job.id}`);
    if (job.name === JOBS.ENRICHMENT_PASS) {
      const topN =
        typeof job.data?.topN === 'number' && job.data.topN > 0 ? job.data.topN : 25;
      const result = await this.enrichment.runFullEnrichmentPass(topN);

      // Rescore with new signals; do not chain enrichment again.
      await this.scoringQueue.add(
        JOBS.SCORING_RUN_ALL,
        { trigger: JOBS.ENRICHMENT_PASS, chainEnrichment: false },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );
      this.logger.log(`Chained ${JOBS.SCORING_RUN_ALL} (no enrich loop) after enrichment`);
      return result;
    }
    throw new Error(`Unknown enrichment job: ${job.name}`);
  }
}
