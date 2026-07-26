import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { LeadsService } from './leads.service';
import { OutreachService } from './outreach.service';

@Controller('leads')
@UseGuards(ApiTokenGuard)
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly outreach: OutreachService,
  ) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('includeSnoozed') includeSnoozed?: string,
  ) {
    return this.leads.list(status, includeSnoozed === 'true');
  }

  @Post()
  create(@Body('parcelId') parcelId: string, @Body('whyNow') whyNow?: string) {
    return this.leads.create(parcelId, whyNow);
  }

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.leads.updateStatus(id, status);
  }

  @Post(':id/outcome')
  outcome(@Param('id') id: string, @Body('outcome') outcome: string) {
    return this.leads.logOutcome(id, outcome);
  }

  @Post(':id/snooze')
  snooze(@Param('id') id: string, @Body('days') days: number) {
    return this.leads.snooze(id, days);
  }

  @Post(':id/feedback')
  feedback(
    @Param('id') id: string,
    @Body('rating') rating: string,
    @Body('note') note?: string,
    @Body('reason') reason?: string,
  ) {
    return this.leads.addFeedback(id, rating, note, reason);
  }

  @Get(':id/outreach')
  outreachDrafts(@Param('id') id: string, @Query('llm') llm?: string) {
    const mode =
      llm === '0' || llm === 'false'
        ? false
        : llm === '1' || llm === 'true'
          ? true
          : ('auto' as const);
    return this.outreach.draftsForLead(id, { llm: mode });
  }

  @Get(':id/neighbors')
  neighbors(@Param('id') id: string) {
    return this.leads.neighbors(id);
  }
}
