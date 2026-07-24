import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { JOBS, QUEUES } from '../jobs/queues';
import { ParcelsSyncService } from './parcels-sync.service';

@Processor(QUEUES.INGESTION)
export class ParcelsSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ParcelsSyncProcessor.name);

  constructor(
    private readonly syncService: ParcelsSyncService,
    @InjectQueue(QUEUES.SCORING) private readonly scoringQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} id=${job.id}`);

    if (job.name === JOBS.PARCELS_FULL_SYNC || job.name === JOBS.PARCELS_DAILY_SYNC) {
      const result = await this.syncService.runFullSync(
        job.name === JOBS.PARCELS_DAILY_SYNC ? 'arcgis_parcels_daily' : 'arcgis_parcels',
      );

      if (result.status === 'success') {
        await this.scoringQueue.add(
          JOBS.SCORING_RUN_ALL,
          { syncRunId: result.syncRunId, trigger: job.name },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 50,
            removeOnFail: 50,
          },
        );
        this.logger.log(`Chained ${JOBS.SCORING_RUN_ALL} after successful sync`);
      } else {
        throw new Error(result.error ?? 'Parcel sync failed');
      }

      return result;
    }

    throw new Error(`Unknown ingestion job: ${job.name}`);
  }
}