import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): { ok: true; commit: string; service: string } {
    return {
      ok: true,
      service: 'cre-api+web',
      commit:
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.RAILWAY_GIT_COMMIT ||
        process.env.GIT_COMMIT ||
        'unknown',
    };
  }
}
