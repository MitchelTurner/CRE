import { Module } from '@nestjs/common';
import { ArcGisClient } from '../arcgis/arcgis.client';
import { ParcelsSyncService } from './parcels-sync.service';
import { ParcelsSyncProcessor } from './parcels-sync.processor';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  providers: [ArcGisClient, ParcelsSyncService, ParcelsSyncProcessor],
  exports: [ParcelsSyncService, ArcGisClient],
})
export class IngestionModule {}