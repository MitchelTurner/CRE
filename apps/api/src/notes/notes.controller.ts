import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(ApiTokenGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(
    @Query('kind') kind?: string,
    @Query('parcelId') parcelId?: string,
    @Query('personId') personId?: string,
    @Query('leadId') leadId?: string,
    @Query('eventId') eventId?: string,
  ) {
    return this.notes.list({ kind, parcelId, personId, leadId, eventId });
  }

  @Post()
  create(
    @Body()
    body: {
      kind: string;
      body: string;
      title?: string;
      parcelId?: string;
      personId?: string;
      leadId?: string;
      eventId?: string;
      meetingAt?: string;
    },
  ) {
    return this.notes.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { body?: string; title?: string; meetingAt?: string | null },
  ) {
    return this.notes.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notes.remove(id);
  }
}
