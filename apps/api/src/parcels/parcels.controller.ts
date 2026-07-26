import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { OutreachService } from '../leads/outreach.service';
import { ParcelsService } from './parcels.service';

@Controller('parcels')
@UseGuards(ApiTokenGuard)
export class ParcelsController {
  constructor(
    private readonly parcels: ParcelsService,
    private readonly outreach: OutreachService,
    private readonly enrichment: EnrichmentService,
  ) {}

  @Get()
  list(
    @Query('minScore') minScore?: number,
    @Query('landUse') landUse?: string,
    @Query('absentee') absentee?: string,
    @Query('hotOnly') hotOnly?: string,
    @Query('missingContact') missingContact?: string,
    @Query('sort') sort?: 'score',
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.parcels.list({
      minScore,
      landUse,
      absentee: absentee === undefined ? undefined : absentee === 'true',
      hotOnly: hotOnly === 'true',
      missingContact: missingContact === 'true',
      sort,
      limit,
      offset,
    });
  }

  @Get('map')
  map(
    @Query('minScore') minScore?: number,
    @Query('limit') limit?: number,
  ) {
    return this.parcels.mapPoints({
      minScore: minScore !== undefined ? Number(minScore) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }

  /**
   * Outreach drafts. Default auto = LLM when enabled, else template.
   * `llm=0` forces template; `llm=1` forces LLM (falls back to template on error).
   */
  @Get(':pin/outreach')
  outreachDrafts(@Param('pin') pin: string, @Query('llm') llm?: string) {
    const mode =
      llm === '0' || llm === 'false'
        ? false
        : llm === '1' || llm === 'true'
          ? true
          : ('auto' as const);
    return this.outreach.draftsForParcel(pin, { llm: mode });
  }

  /** Generate / regenerate LLM email + call script on demand. */
  @Post(':pin/outreach')
  generateOutreach(@Param('pin') pin: string, @Body('tone') _tone?: string) {
    return this.outreach.draftsForParcel(pin, { llm: true });
  }

  /** Scrape/refresh public data for this parcel (ArcGIS, FEMA, assessor, SoS, ROD…). */
  @Post(':pin/enrich')
  enrich(@Param('pin') pin: string) {
    return this.enrichment.enrichParcelByPin(pin);
  }

  @Get(':pin')
  getByPin(@Param('pin') pin: string) {
    return this.parcels.getByPin(pin);
  }
}
