import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { EnrichmentService } from './enrichment.service';
import { EnrichmentProcessor } from './enrichment.processor';
import { HitlService } from './hitl.service';
import { OwnerGraphService } from './owner-graph.service';
import { SignalService } from './signal.service';
import { HitlController } from './hitl.controller';

@Module({
  imports: [JobsModule],
  controllers: [HitlController],
  providers: [EnrichmentService, EnrichmentProcessor, SignalService, OwnerGraphService, HitlService],
  exports: [EnrichmentService, SignalService, OwnerGraphService, HitlService],
})
export class EnrichmentModule {}
