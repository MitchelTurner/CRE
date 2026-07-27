import { createRodClient, DisabledRodClient, getRodClientStatus } from './rod.client';

describe('getRodClientStatus / createRodClient', () => {
  it('treats True/1 as enabled (Railway-friendly)', () => {
    for (const flag of ['true', 'True', 'TRUE', '1', 'yes']) {
      const status = getRodClientStatus({
        ROD_SCRAPER_ENABLED: flag,
        ROD_EMAIL: 'agent@example.com',
        ROD_PASSWORD: 'secret',
      });
      expect(status.ready).toBe(true);
      expect(createRodClient({
        ROD_SCRAPER_ENABLED: flag,
        ROD_EMAIL: 'agent@example.com',
        ROD_PASSWORD: 'secret',
      })).not.toBeInstanceOf(DisabledRodClient);
    }
  });

  it('reports missing flag clearly', () => {
    const status = getRodClientStatus({
      ROD_EMAIL: 'agent@example.com',
      ROD_PASSWORD: 'secret',
    });
    expect(status.ready).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.reason).toMatch(/ROD_SCRAPER_ENABLED/);
    expect(createRodClient({
      ROD_EMAIL: 'agent@example.com',
      ROD_PASSWORD: 'secret',
    })).toBeInstanceOf(DisabledRodClient);
  });

  it('reports missing credentials when enabled', () => {
    const status = getRodClientStatus({ ROD_SCRAPER_ENABLED: 'true' });
    expect(status.ready).toBe(false);
    expect(status.enabled).toBe(true);
    expect(status.credentialsPresent).toBe(false);
    expect(status.reason).toMatch(/ROD_EMAIL/);
  });
});
