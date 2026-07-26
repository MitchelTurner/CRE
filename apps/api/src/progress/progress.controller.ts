import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { ProgressService } from './progress.service';

@Controller('progress')
@UseGuards(ApiTokenGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  getSummary() {
    return this.progress.getSummary();
  }
}
