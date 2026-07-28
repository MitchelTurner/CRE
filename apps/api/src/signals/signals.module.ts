import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UccConnector } from './connectors/ucc.connector';
import { FmcsaConnector } from './connectors/fmcsa.connector';
import { EchoConnector } from './connectors/echo.connector';
import { SbaConnector } from './connectors/sba.connector';
import { HiringConnector, ImportsConnector } from './connectors/stub.connectors';
import { EntityResolutionService } from './resolution/entity-resolution.service';
import { SignalPipelineService } from './signal-pipeline.service';
import { SpaceScoreService } from './space-score.service';
import { SignalsProcessor } from './signals.processor';
import { SignalsController } from './signals.controller';

@Module({
  imports: [PrismaModule, JobsModule],
  controllers: [SignalsController],
  providers: [
    UccConnector,
    FmcsaConnector,
    EchoConnector,
    SbaConnector,
    ImportsConnector,
    HiringConnector,
    EntityResolutionService,
    SpaceScoreService,
    SignalPipelineService,
    SignalsProcessor,
  ],
  exports: [SignalPipelineService, SpaceScoreService, EntityResolutionService],
})
export class SignalsModule {}
