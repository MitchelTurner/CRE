import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(ApiTokenGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('today')
  today() {
    return this.dashboard.today();
  }
}
