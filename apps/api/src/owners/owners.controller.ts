import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { OwnersService } from './owners.service';

@Controller('owners')
@UseGuards(ApiTokenGuard)
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.owners.getById(id);
  }

  @Post(':id/refresh-people')
  refreshPeople(@Param('id') id: string) {
    return this.owners.refreshPeople(id);
  }
}
