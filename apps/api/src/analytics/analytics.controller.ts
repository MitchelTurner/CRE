import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(ApiTokenGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('status')
  status() {
    return this.analytics.status();
  }

  /** Grounded Ask AI over inventory, call queue, catalysts, events. */
  @Post('ask')
  ask(@Body('question') question: string, @Body('pin') pin?: string) {
    return this.analytics.ask(question, pin);
  }

  @Post('parcels/:pin/explain')
  explain(@Param('pin') pin: string) {
    return this.analytics.explainParcel(pin);
  }

  @Post('parcels/:pin/polish-outreach')
  polish(@Param('pin') pin: string, @Body('tone') tone?: string) {
    return this.analytics.polishOutreach(pin, tone);
  }

  @Post('market-narrative')
  narrative() {
    return this.analytics.marketNarrative();
  }
}
