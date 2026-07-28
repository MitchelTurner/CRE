import { readFileSync } from 'fs';
import { join } from 'path';
import { FmcsaConnector } from './fmcsa.connector';

describe('FmcsaConnector.normalize', () => {
  const connector = new FmcsaConnector();
  const fixtures = JSON.parse(
    readFileSync(join(__dirname, '../../../test/fixtures/signals/fmcsa-sample.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;

  it('emits NEW_CARRIER for first-seen DOT', () => {
    const drafts = connector.normalize({
      sourceRef: 'new',
      fetchedAt: new Date(),
      body: fixtures[0],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe('NEW_CARRIER');
    expect(drafts[0]!.weight).toBe(25);
    expect(drafts[0]!.dotNumber).toBe('4123456');
  });

  it('emits FLEET_CHANGE growth with capped weight', () => {
    const drafts = connector.normalize({
      sourceRef: 'growth',
      fetchedAt: new Date(),
      body: fixtures[1],
    });
    expect(drafts[0]!.type).toBe('FLEET_CHANGE');
    expect(drafts[0]!.subtype).toBe('growth');
    expect(drafts[0]!.weight).toBeGreaterThanOrEqual(10);
    expect(drafts[0]!.weight).toBeLessThanOrEqual(40);
  });
});
