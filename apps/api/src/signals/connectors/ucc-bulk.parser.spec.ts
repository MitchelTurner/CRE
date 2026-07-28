import { readFileSync } from 'fs';
import { join } from 'path';
import { filterTargetCounties, joinUccBulkFiles, parseUccCsv } from './ucc-bulk.parser';

describe('ucc-bulk.parser', () => {
  const fixtureDir = join(__dirname, '../../../test/fixtures/signals');

  it('parses normalized UCC CSV', () => {
    const csv = readFileSync(join(fixtureDir, 'ucc-bulk-normalized.csv'), 'utf8');
    const rows = parseUccCsv(csv);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]!.debtorName).toMatch(/Upstate Fabrication/i);
    expect(rows[0]!.debtorCounty).toMatch(/Greenville/i);
  });

  it('joins filings + parties CSVs', () => {
    const filingsCsv = readFileSync(join(fixtureDir, 'ucc-bulk-filings.csv'), 'utf8');
    const partiesCsv = readFileSync(join(fixtureDir, 'ucc-bulk-parties.csv'), 'utf8');
    const rows = joinUccBulkFiles({ filingsCsv, partiesCsv });
    expect(rows.some((r) => /Piedmont Metals/i.test(r.debtorName))).toBe(true);
    expect(rows.find((r) => /Piedmont Metals/i.test(r.debtorName))?.securedParty).toMatch(
      /Machine Capital/i,
    );
  });

  it('filters target counties and since', () => {
    const rows = filterTargetCounties(
      [
        {
          filingNumber: '1',
          filingDate: '2026-07-01',
          debtorName: 'A',
          debtorCounty: 'Greenville',
        },
        {
          filingNumber: '2',
          filingDate: '2026-07-01',
          debtorName: 'B',
          debtorCounty: 'Charleston',
        },
      ],
      ['GREENVILLE'],
      new Date('2026-06-01'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.debtorName).toBe('A');
  });
});
