import { Module } from '@nestjs/common';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';
import { LeadsModule } from '../leads/leads.module';
import { EnrichmentModule } from '../enrichment/enrichment.module';

@Module({
  imports: [LeadsModule, EnrichmentModule],
  controllers: [ParcelsController],
  providers: [ParcelsService],
})
export class ParcelsModule {}
