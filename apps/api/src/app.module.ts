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
import { HealthController } from './health.controller';

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
        connection: {
          url: config.getOrThrow<string>('redisUrl'),
        },
      }),
    }),
    PrismaModule,
    AppConfigModule,
    JobsModule,
    IngestionModule,
    ScoringModule,
    DigestModule,
    ParcelsModule,
    LeadsModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}