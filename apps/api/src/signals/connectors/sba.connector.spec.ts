import { readFileSync } from 'fs';
import { join } from 'path';
import { SbaConnector } from './sba.connector';

describe('SbaConnector.normalize', () => {
  const connector = new SbaConnector();
  const fixtures = JSON.parse(
    readFileSync(join(__dirname, '../../../test/fixtures/signals/sba-sample.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;

  it('maps 504 loan to SBA_LOAN weight 30 with nurture tag', () => {
    const drafts = connector.normalize({
      sourceRef: 'sba:504:test',
      fetchedAt: new Date(),
      body: fixtures[0],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe('SBA_LOAN');
    expect(drafts[0]!.subtype).toBe('504');
    expect(drafts[0]!.weight).toBe(30);
    expect(drafts[0]!.companyName).toMatch(/Upstate Fabrication/i);
    expect(drafts[0]!.payload).toMatchObject({ nurture: true, nurtureHorizonMonths: 36 });
  });

  it('maps 7(a) loan to weight 20', () => {
    const drafts = connector.normalize({
      sourceRef: 'sba:7a:test',
      fetchedAt: new Date(),
      body: fixtures[1],
    });
    expect(drafts[0]!.subtype).toBe('7a');
    expect(drafts[0]!.weight).toBe(20);
    expect(drafts[0]!.payload).toMatchObject({ nurture: true });
  });
});
