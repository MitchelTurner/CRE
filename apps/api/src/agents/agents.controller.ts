import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { AgentsService } from './agents.service';

@Controller('agents')
@UseGuards(ApiTokenGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list(@Query('sort') _sort?: string, @Query('limit') limit?: string) {
    return this.agents.rank(Math.min(parseInt(limit ?? '15', 10) || 15, 100));
  }
}
