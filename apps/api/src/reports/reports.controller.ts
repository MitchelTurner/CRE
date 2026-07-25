import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(ApiTokenGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.reports.list(parseInt(limit ?? '10', 10) || 10);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.reports.get(id);
  }

  @Post('quarterly')
  quarterly() {
    return this.reports.generateQuarterly(true);
  }
}
