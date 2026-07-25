import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { OutreachService } from '../leads/outreach.service';
import { ParcelsService } from './parcels.service';

@Controller('parcels')
@UseGuards(ApiTokenGuard)
export class ParcelsController {
  constructor(
    private readonly parcels: ParcelsService,
    private readonly outreach: OutreachService,
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

  @Get(':pin/outreach')
  outreachDrafts(@Param('pin') pin: string) {
    return this.outreach.draftsForParcel(pin);
  }

  @Get(':pin')
  getByPin(@Param('pin') pin: string) {
    return this.parcels.getByPin(pin);
  }
}