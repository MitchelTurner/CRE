import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { JobsModule } from './jobs/jobs.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ScoringModule } from './scoring/scoring.module';
import { DigestModule } from './digest/digest.module';
import { ParcelsModule } from './parcels/parcels.module';
import { LeadsModule } from './leads/leads.module';
import { AdminModule } from './admin/admin.module';
import { AppConfigModule } from './app-config/app-config.module';
import { EnrichmentModule } from './enrichment/enrichment.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LlmModule } from './llm/llm.module';
import { EventsModule } from './events/events.module';
import { AgentsModule } from './agents/agents.module';
import { ReportsModule } from './reports/reports.module';
import { HostModule } from './host/host.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { OwnersModule } from './owners/owners.module';
import { ProgressModule } from './progress/progress.module';
import { NotesModule } from './notes/notes.module';
import { DrivebyModule } from './driveby/driveby.module';
import { HealthController } from './health.controller';
import { buildRedisConnection } from './config/redis.connection';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: buildRedisConnection(config.getOrThrow<string>('redisUrl')),
      }),
    }),
    PrismaModule,
    AppConfigModule,
    LlmModule,
    JobsModule,
    IngestionModule,
    ScoringModule,
    EnrichmentModule,
    DigestModule,
    ParcelsModule,
    LeadsModule,
    DashboardModule,
    EventsModule,
    AgentsModule,
    ReportsModule,
    HostModule,
    AnalyticsModule,
    OwnersModule,
    ProgressModule,
    NotesModule,
    DrivebyModule,
    AdminModule,
  ],


  controllers: [HealthController],
})
export class AppModule {}
