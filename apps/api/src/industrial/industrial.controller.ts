import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTokenGuard } from '../auth/api-token.guard';
import {
  BuildingAttributesService,
  type BuildingAttributesInput,
} from './building-attributes.service';
import { CoverageService } from './coverage.service';
import { IndustrialReportService } from './industrial-report.service';
import {
  RequirementMatchingService,
  type RequirementInput,
} from './requirement-matching.service';

@Controller()
@UseGuards(ApiTokenGuard)
export class IndustrialController {
  constructor(
    private readonly buildings: BuildingAttributesService,
    private readonly requirements: RequirementMatchingService,
    private readonly coverage: CoverageService,
    private readonly report: IndustrialReportService,
  ) {}

  @Get('parcels/:pin/building-attributes')
  getAttrs(@Param('pin') pin: string) {
    return this.buildings.getByPin(pin);
  }

  @Put('parcels/:pin/building-attributes')
  putAttrs(@Param('pin') pin: string, @Body() body: BuildingAttributesInput) {
    return this.buildings.upsertByPin(pin, body ?? {});
  }

  @Get('industrial/coverage')
  coverageKpi() {
    return this.coverage.bySubmarket();
  }

  @Get('requirements')
  listRequirements(@Query('all') all?: string) {
    return this.requirements.list(all !== '1' && all !== 'true');
  }

  @Post('requirements')
  createRequirement(@Body() body: RequirementInput) {
    return this.requirements.create(body);
  }

  @Get('requirements/:id')
  async getRequirement(@Param('id') id: string) {
    const row = await this.requirements.get(id);
    return row ?? { ok: false, note: 'Not found' };
  }

  @Patch('requirements/:id')
  updateRequirement(@Param('id') id: string, @Body() body: Partial<RequirementInput>) {
    return this.requirements.update(id, body ?? {});
  }

  @Get('requirements/:id/matches')
  matchRequirement(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.requirements.match(id, Math.min(Number(limit ?? '50') || 50, 200));
  }

  @Get('requirements/:id/matches.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async matchCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('limit') limit?: string,
  ) {
    const { requirement, matches } = await this.requirements.match(
      id,
      Math.min(Number(limit ?? '200') || 200, 500),
    );
    const csv = this.requirements.toCsv(matches);
    const name = `canvass-${(requirement?.clientName || id).replace(/[^\w.-]+/g, '_')}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(csv);
  }

  @Post('admin/reports/industrial-quarterly')
  industrialQuarterly(@Body() body?: { email?: boolean }) {
    return this.report.generate({ email: Boolean(body?.email) });
  }
}
