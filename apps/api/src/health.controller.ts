import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root(): {
    service: string;
    ok: true;
    health: string;
    docs: string;
  } {
    return {
      service: 'greenville-cre-lead-engine',
      ok: true,
      health: '/health',
      docs: 'Authenticated API: /parcels, /admin/sync, /admin/digest/preview (Bearer API_TOKEN)',
    };
  }

  @Get('health')
  getHealth(): { ok: true } {
    return { ok: true };
  }
}
