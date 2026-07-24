import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { HitlService } from './hitl.service';

@Controller('admin/hitl')
@UseGuards(ApiTokenGuard)
export class HitlController {
  constructor(private readonly hitl: HitlService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.hitl.list(status || 'pending');
  }

  @Post('refresh')
  async refresh(@Query('limit') limit?: string) {
    const n = Math.min(Math.max(parseInt(limit ?? '25', 10) || 25, 1), 100);
    const created = await this.hitl.refreshQueue(n);
    return { created };
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('note') note?: string,
  ) {
    return this.hitl.update(id, status, note);
  }
}
