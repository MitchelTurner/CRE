import { Module } from '@nestjs/common';
import { DigestService } from './digest.service';
import { DigestProcessor } from './digest.processor';
import { EmailService } from './email.service';
import { AppConfigModule } from '../app-config/app-config.module';
import { ScoringModule } from '../scoring/scoring.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule, ScoringModule, AppConfigModule],
  providers: [DigestService, DigestProcessor, EmailService],
  exports: [DigestService, EmailService],
})
export class DigestModule {}