import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('requires a question', async () => {
    const svc = new AnalyticsService(
      {} as never,
      { status: { enabled: true, hasKey: true, model: 'x' }, enabled: true } as never,
      { get: () => 'Greenville' } as never,
    );
    await expect(svc.ask('')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed when LLM is off', async () => {
    const svc = new AnalyticsService(
      {} as never,
      {
        status: { enabled: false, hasKey: false, model: 'x' },
        enabled: false,
      } as never,
      { get: () => 'Greenville' } as never,
    );
    await expect(svc.ask('What should I call today?')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
