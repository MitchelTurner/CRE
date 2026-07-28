import { computeSpaceScore, normalizeCompanyName } from '@cre/shared';

describe('industrial shared helpers', () => {
  it('normalizeCompanyName strips suffixes', () => {
    expect(normalizeCompanyName('Upstate Fabrication, LLC')).toBe('UPSTATE FABRICATION');
  });

  it('computeSpaceScore applies diversity bonus', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const result = computeSpaceScore(
      [
        {
          id: '1',
          type: 'EQUIPMENT_FINANCING',
          weight: 35,
          confidence: 1,
          occurredAt: new Date('2026-07-20T00:00:00Z'),
        },
        {
          id: '2',
          type: 'FLEET_CHANGE',
          weight: 30,
          confidence: 1,
          occurredAt: new Date('2026-07-21T00:00:00Z'),
        },
      ],
      now,
    );
    expect(result.score).toBeGreaterThan(60);
    expect(result.bandLabel).toBe('hot');
  });
});
