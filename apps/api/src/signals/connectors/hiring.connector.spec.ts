import { HiringConnector } from './hiring.connector';

describe('HiringConnector', () => {
  const connector = new HiringConnector();

  it('aggregates postings into surge when ≥8 at one address', () => {
    const base = {
      companyName: 'Greer Pack LLC',
      address: '200 Brookfield St Greer SC 29650',
    };
    const rows = Array.from({ length: 8 }, (_, i) => ({
      ...base,
      title: i % 2 ? 'Warehouse Associate' : 'Production Operator',
      postedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    }));
    const raws = connector.toRawRecords(rows, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
    expect(raws).toHaveLength(1);
    const drafts = connector.normalize(raws[0]!);
    expect(drafts[0]!.type).toBe('HIRING_SURGE');
    expect(drafts[0]!.weight).toBe(25);
    expect(drafts[0]!.payload).toMatchObject({ postingCount: 8 });
  });

  it('ignores non warehouse/production titles', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      companyName: 'Office Co',
      address: '1 Main St Greenville SC',
      title: 'Account Executive',
      postedAt: new Date(Date.now() - i * 86400000).toISOString(),
    }));
    expect(connector.toRawRecords(rows, new Date(0))).toHaveLength(0);
  });
});
