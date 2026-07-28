import { readFileSync } from 'fs';
import { join } from 'path';
import { UccConnector } from './ucc.connector';

describe('UccConnector.normalize', () => {
  const connector = new UccConnector();
  const fixtures = JSON.parse(
    readFileSync(join(__dirname, '../../../test/fixtures/signals/ucc-sample.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;

  it('classifies material_handling at weight 35', () => {
    const drafts = connector.normalize({
      sourceRef: String(fixtures[0]!.filingNumber),
      fetchedAt: new Date(),
      body: fixtures[0],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe('EQUIPMENT_FINANCING');
    expect(drafts[0]!.subtype).toBe('material_handling');
    expect(drafts[0]!.weight).toBe(35);
    expect(drafts[0]!.companyName).toMatch(/Upstate Fabrication/i);
  });

  it('classifies production_equipment', () => {
    const drafts = connector.normalize({
      sourceRef: String(fixtures[1]!.filingNumber),
      fetchedAt: new Date(),
      body: fixtures[1],
    });
    expect(drafts[0]!.subtype).toBe('production_equipment');
    expect(drafts[0]!.weight).toBe(30);
  });

  it('classifies termination', () => {
    const drafts = connector.normalize({
      sourceRef: String(fixtures[2]!.filingNumber),
      fetchedAt: new Date(),
      body: fixtures[2],
    });
    expect(drafts[0]!.subtype).toBe('termination');
    expect(drafts[0]!.weight).toBe(20);
  });
});
