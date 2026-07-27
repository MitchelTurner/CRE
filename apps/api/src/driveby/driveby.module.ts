import { Module } from '@nestjs/common';
import { DrivebyController } from './driveby.controller';
import { DrivebyService } from './driveby.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EnrichmentModule } from '../enrichment/enrichment.module';

@Module({
  imports: [PrismaModule, EnrichmentModule],
  controllers: [DrivebyController],
  providers: [DrivebyService],
  exports: [DrivebyService],
})
export class DrivebyModule {}
