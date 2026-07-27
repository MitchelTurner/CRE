import { Module } from '@nestjs/common';
import { DigestModule } from '../digest/digest.module';
import { JobsModule } from '../jobs/jobs.module';
import { LlmModule } from '../llm/llm.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventSyncService } from './event-sync.service';
import { MatchingService } from './matching.service';
import { BriefService } from './brief.service';
import { EventsProcessor } from './events.processor';

@Module({
  imports: [DigestModule, JobsModule, LlmModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventSyncService,
    MatchingService,
    BriefService,
    EventsProcessor,
  ],
  exports: [EventsService, EventSyncService, MatchingService, BriefService],
})
export class EventsModule {}
