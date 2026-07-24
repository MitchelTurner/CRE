import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from './queues';
import { JobsScheduler } from './jobs.scheduler';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.INGESTION },
      { name: QUEUES.SCORING },
      { name: QUEUES.DIGEST },
    ),
  ],
  providers: [JobsScheduler],
  exports: [BullModule],
})
export class JobsModule {}