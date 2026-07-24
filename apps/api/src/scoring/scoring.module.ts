import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { WhyNowService } from './why-now.service';
import { ScoringProcessor } from './scoring.processor';
import { FeedbackTuningService } from './feedback-tuning.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  providers: [ScoringService, WhyNowService, ScoringProcessor, FeedbackTuningService],
  exports: [ScoringService, WhyNowService, FeedbackTuningService],
})
export class ScoringModule {}
