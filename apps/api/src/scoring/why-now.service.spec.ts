import { WhyNowService } from './why-now.service';

describe('WhyNowService', () => {
  const svc = new WhyNowService();

  it('builds a one-liner from components', () => {
    const line = svc.generate({
      deedDate: new Date('2010-01-01T00:00:00Z'),
      ownerName: 'ACME HOLDINGS LLC',
      isEntity: true,
      isAbsentee: true,
      mailingState: 'GA',
      homeState: 'SC',
      activeCommercialParcelCount: 5,
      landUseCode: '940',
      propType: 'INDUSTRIAL',
      components: {
        holdPeriod: 40,
        absentee: 25,
        entity: 10,
        multiParcel: 10,
        landUsePriority: 15,
        taxDelinquent: 0,
        mortgageMaturity: 0,
        foreclosure: 0,
        recentSeller: 0,
        sosBoost: 0,
        fmvBoost: 0,
      },
      signalTypes: ['tax_delinquent', 'mortgage_maturity'],
    });

    expect(line).toMatch(/Owned \d+ years/);
    expect(line).toContain('out-of-state entity');
    expect(line).toContain('5 commercial parcels');
    expect(line).toContain('industrial');
    expect(line).toContain('Catalyst:');
    expect(line).toContain('tax delinquency');
    expect(line).toContain('loan maturity');
    expect(line.endsWith('.')).toBe(true);
  });
});