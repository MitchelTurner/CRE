import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UccConnector } from './connectors/ucc.connector';
import { FmcsaConnector } from './connectors/fmcsa.connector';
import { EchoConnector } from './connectors/echo.connector';
import { SbaConnector } from './connectors/sba.connector';
import { ImportsConnector } from './connectors/imports.connector';
import { HiringConnector } from './connectors/hiring.connector';
import { AerialConnector } from './connectors/aerial.connector';
import { EntityResolutionService } from './resolution/entity-resolution.service';
import { SignalPipelineService } from './signal-pipeline.service';
import { SpaceScoreService } from './space-score.service';
import { SignalsProcessor } from './signals.processor';
import { SignalsController } from './signals.controller';
import { YardObservationService } from './yard-observation.service';

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
    AerialConnector,
    EntityResolutionService,
    SpaceScoreService,
    SignalPipelineService,
    SignalsProcessor,
    YardObservationService,
  ],
  exports: [SignalPipelineService, SpaceScoreService, EntityResolutionService, YardObservationService],
})
export class SignalsModule {}
