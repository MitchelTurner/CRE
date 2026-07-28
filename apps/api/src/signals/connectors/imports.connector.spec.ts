import { ImportsConnector } from './imports.connector';

describe('ImportsConnector.normalize', () => {
  const connector = new ImportsConnector();

  it('emits IMPORT_VOLUME growth at weight 30 for Greer consignee', () => {
    const drafts = connector.normalize({
      sourceRef: 'imports:test',
      fetchedAt: new Date(),
      body: {
        consigneeName: 'Upstate Distribution Inc',
        consigneeCity: 'Greer',
        consigneeState: 'SC',
        period: '2026-06',
        teu: 80,
        priorTeu: 40,
      },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe('IMPORT_VOLUME');
    expect(drafts[0]!.weight).toBe(30);
    expect(drafts[0]!.payload).toMatchObject({ internalOnly: true });
  });

  it('skips non-growth', () => {
    const drafts = connector.normalize({
      sourceRef: 'imports:flat',
      fetchedAt: new Date(),
      body: {
        consigneeName: 'Flatliner LLC',
        consigneeCity: 'Greer',
        consigneeState: 'SC',
        period: '2026-06',
        teu: 42,
        priorTeu: 40,
      },
    });
    expect(drafts).toHaveLength(0);
  });
});
