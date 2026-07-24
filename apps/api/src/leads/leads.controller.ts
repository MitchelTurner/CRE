import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(ApiTokenGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.leads.list(status);
  }

  @Post()
  create(@Body('parcelId') parcelId: string, @Body('whyNow') whyNow?: string) {
    return this.leads.create(parcelId, whyNow);
  }

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.leads.updateStatus(id, status);
  }
}
