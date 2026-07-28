import { Module } from '@nestjs/common';
import { DigestModule } from '../digest/digest.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BuildingAttributesService } from './building-attributes.service';
import { CoverageService } from './coverage.service';
import { IndustrialController } from './industrial.controller';
import { IndustrialReportService } from './industrial-report.service';
import { RequirementMatchingService } from './requirement-matching.service';

@Module({
  imports: [PrismaModule, DigestModule],
  controllers: [IndustrialController],
  providers: [
    BuildingAttributesService,
    RequirementMatchingService,
    CoverageService,
    IndustrialReportService,
  ],
  exports: [
    BuildingAttributesService,
    RequirementMatchingService,
    CoverageService,
    IndustrialReportService,
  ],
})
export class IndustrialModule {}
