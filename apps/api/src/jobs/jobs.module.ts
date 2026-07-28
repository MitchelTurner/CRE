import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from './queues';
import { JobsScheduler } from './jobs.scheduler';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.INGESTION },
      { name: QUEUES.SCORING },
      { name: QUEUES.ENRICHMENT },
      { name: QUEUES.DIGEST },
      { name: QUEUES.EVENTS },
      { name: QUEUES.REPORTS },
      { name: QUEUES.SIGNALS },
    ),
  ],
  providers: [JobsScheduler],
  exports: [BullModule],
})
export class JobsModule {}