import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { DigestModule } from '../digest/digest.module';
import { JobsModule } from '../jobs/jobs.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsProcessor } from './reports.processor';

@Module({
  imports: [AgentsModule, DigestModule, JobsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsProcessor],
  exports: [ReportsService],
})
export class ReportsModule {}
