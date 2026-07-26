import { Controller, Get, Param, Post } from '@nestjs/common';
import { OwnersService } from './owners.service';

@Controller('owners')
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
