import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { WhyNowService } from './why-now.service';
import { ScoringProcessor } from './scoring.processor';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  providers: [ScoringService, WhyNowService, ScoringProcessor],
  exports: [ScoringService, WhyNowService],
})
export class ScoringModule {}