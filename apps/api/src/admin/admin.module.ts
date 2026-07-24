import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DigestModule } from '../digest/digest.module';
import { JobsModule } from '../jobs/jobs.module';
import { ScoringModule } from '../scoring/scoring.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [JobsModule, DigestModule, ScoringModule, LeadsModule],
  controllers: [AdminController],
})
export class AdminModule {}
