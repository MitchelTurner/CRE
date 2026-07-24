import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(ApiTokenGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.leads.updateStatus(id, status);
  }
}