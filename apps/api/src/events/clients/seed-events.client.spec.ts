import { SeedEventClient } from './seed-events.client';

describe('SeedEventClient', () => {
  it('returns upcoming Greenville CRE placeholders within window', async () => {
    const client = new SeedEventClient();
    const from = new Date('2026-07-26T12:00:00Z');
    const to = new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);
    const drafts = await client.fetchUpcoming(from, to);
    expect(drafts.length).toBeGreaterThanOrEqual(5);
    expect(drafts.every((d) => d.startsAt >= from && d.startsAt <= to)).toBe(true);
    expect(drafts.some((d) => /NAIOP|CCIM|UCREIA|CREW|1031/i.test(d.name))).toBe(true);
    expect(drafts.every((d) => d.ownerDensity === 'high' || d.ownerDensity === 'medium')).toBe(
      true,
    );
  });
});
