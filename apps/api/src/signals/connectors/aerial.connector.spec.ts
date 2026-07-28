import { AerialConnector, classifyYardEvent } from './aerial.connector';

describe('classifyYardEvent', () => {
  it('overflow when >85% on two flights', () => {
    expect(classifyYardEvent(90, 88)).toBe('overflow');
  });

  it('contraction when drop from >60% to <20%', () => {
    expect(classifyYardEvent(15, 72)).toBe('contraction');
  });

  it('observation otherwise', () => {
    expect(classifyYardEvent(90, 40)).toBe('observation');
    expect(classifyYardEvent(50, null)).toBe('observation');
  });
});

describe('AerialConnector.normalize', () => {
  const connector = new AerialConnector({} as never);

  it('emits overflow weight 35', () => {
    const drafts = connector.normalize({
      sourceRef: 'aerial:overflow:test',
      fetchedAt: new Date(),
      body: {
        eventKind: 'overflow',
        companyName: 'Greer Logistics LLC',
        siteAddress: '100 Inland Port Rd Greer SC',
        flightDate: '2026-07-01',
        yardCoveragePct: 92,
        priorYardCoveragePct: 88,
        annotatedImageRef: 'data:image/svg+xml;base64,abc',
      },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe('YARD_UTILIZATION');
    expect(drafts[0]!.subtype).toBe('overflow');
    expect(drafts[0]!.weight).toBe(35);
  });

  it('emits contraction weight 30', () => {
    const drafts = connector.normalize({
      sourceRef: 'aerial:contraction:test',
      fetchedAt: new Date(),
      body: {
        eventKind: 'contraction',
        companyName: 'Piedmont Yard Co',
        flightDate: '2026-07-10',
        yardCoveragePct: 12,
        priorYardCoveragePct: 70,
      },
    });
    expect(drafts[0]!.subtype).toBe('contraction');
    expect(drafts[0]!.weight).toBe(30);
  });
});
