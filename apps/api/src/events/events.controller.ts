import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { EventsService } from './events.service';
import { BriefService } from './brief.service';
import { MatchingService } from './matching.service';

@Controller('events')
@UseGuards(ApiTokenGuard)
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly briefs: BriefService,
    private readonly matching: MatchingService,
  ) {}

  @Get()
  list(
    @Query('from') from?: string,
    @Query('density') density?: string,
    @Query('status') status?: string,
  ) {
    return this.events.list({ from, density, status });
  }

  @Post('matches/:personId/:ownerId/confirm')
  confirm(
    @Param('personId') personId: string,
    @Param('ownerId') ownerId: string,
    @Body('confirmed') confirmed: boolean,
  ) {
    return this.matching.setConfirmation(personId, ownerId, confirmed === true).then(() => ({
      ok: true,
    }));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.events.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body('status') status: string) {
    return this.events.updateStatus(id, status);
  }

  @Post(':id/brief')
  brief(@Param('id') id: string, @Body('email') email?: boolean) {
    return this.briefs.generate(id, email === true);
  }

  @Post(':id/attendees/paste')
  paste(
    @Param('id') id: string,
    @Body('text') text: string,
    @Body('role') role?: string,
  ) {
    return this.events.pasteAttendees(id, text, role ?? 'attendee');
  }

  @Post(':id/attendees/ocr')
  ocr(
    @Param('id') id: string,
    @Body()
    body: {
      imageBase64: string;
      mediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      role?: string;
    },
  ) {
    return this.events.ocrAttendees(id, body);
  }

  @Post(':id/attendees/:personId/met')
  markMet(
    @Param('id') id: string,
    @Param('personId') personId: string,
    @Body('met') met?: boolean,
  ) {
    return this.events.markMet(id, personId, met !== false);
  }
}
