import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { SignalPipelineService } from './signal-pipeline.service';
import { SpaceScoreService } from './space-score.service';

@Processor(QUEUES.SIGNALS)
export class SignalsProcessor extends WorkerHost {
  private readonly logger = new Logger(SignalsProcessor.name);

  constructor(
    private readonly pipeline: SignalPipelineService,
    private readonly spaceScores: SpaceScoreService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing ${job.name} ${job.id}`);
    if (job.name === JOBS.SIGNALS_RUN_SOURCE) {
      const key = String(job.data?.sourceKey || '');
      const since = job.data?.since ? new Date(job.data.since) : undefined;
      return this.pipeline.runConnector(key, since);
    }
    if (job.name === JOBS.SIGNALS_SCORE_NIGHTLY) {
      const n = await this.spaceScores.recomputeAll();
      return { recomputed: n };
    }
    throw new Error(`Unknown signals job: ${job.name}`);
  }
}
