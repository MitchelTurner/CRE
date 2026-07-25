import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DigestModule } from '../digest/digest.module';
import { JobsModule } from '../jobs/jobs.module';
import { ScoringModule } from '../scoring/scoring.module';
import { LeadsModule } from '../leads/leads.module';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [JobsModule, DigestModule, ScoringModule, LeadsModule, IngestionModule],
  controllers: [AdminController],
})
export class AdminModule {}
