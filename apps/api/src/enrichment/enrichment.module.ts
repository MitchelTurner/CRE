import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { EnrichmentService } from './enrichment.service';
import { EnrichmentProcessor } from './enrichment.processor';
import { SignalService } from './signal.service';

@Module({
  imports: [JobsModule],
  providers: [EnrichmentService, EnrichmentProcessor, SignalService],
  exports: [EnrichmentService, SignalService],
})
export class EnrichmentModule {}
