import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { ParcelsService } from './parcels.service';

@Controller('parcels')
@UseGuards(ApiTokenGuard)
export class ParcelsController {
  constructor(private readonly parcels: ParcelsService) {}

  @Get()
  list(
    @Query('minScore') minScore?: number,
    @Query('landUse') landUse?: string,
    @Query('absentee') absentee?: string,
    @Query('sort') sort?: 'score',
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.parcels.list({
      minScore,
      landUse,
      absentee: absentee === undefined ? undefined : absentee === 'true',
      sort,
      limit,
      offset,
    });
  }

  @Get(':pin')
  getByPin(@Param('pin') pin: string) {
    return this.parcels.getByPin(pin);
  }
}