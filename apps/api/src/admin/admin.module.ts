import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DigestModule } from '../digest/digest.module';
import { JobsModule } from '../jobs/jobs.module';
import { ScoringModule } from '../scoring/scoring.module';
import { LeadsModule } from '../leads/leads.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { EventsModule } from '../events/events.module';
import { HostModule } from '../host/host.module';
import { EnrichmentModule } from '../enrichment/enrichment.module';

@Module({
  imports: [
    JobsModule,
    DigestModule,
    ScoringModule,
    LeadsModule,
    IngestionModule,
    EventsModule,
    HostModule,
    EnrichmentModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
