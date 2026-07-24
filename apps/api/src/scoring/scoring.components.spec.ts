import {
  scoreAbsentee,
  scoreEntity,
  scoreHoldPeriod,
  scoreLandUsePriority,
  scoreMultiParcel,
  scoreParcel,
  scoreTaxDelinquent,
  scoreFmvBoost,
  scoreSignals,
  normalizeOwnerName,
  isEntityOwner,
  isAbsenteeOwner,
  normalizeAddress,
} from '@cre/shared';

describe('scoreHoldPeriod', () => {
  const asOf = new Date('2026-07-24T00:00:00Z');
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;

  it.each([
    { yearsAgo: 1, expected: 0 },
    { yearsAgo: 3, expected: 0 },
    { yearsAgo: 5, expected: 8 }, // mid of 3–7 → 7.5 → 8
    { yearsAgo: 7, expected: 25 },
    { yearsAgo: 9, expected: 25 },
    { yearsAgo: 10, expected: 35 },
    { yearsAgo: 14, expected: 35 },
    { yearsAgo: 15, expected: 40 },
    { yearsAgo: 30, expected: 40 },
  ])('yearsAgo=$yearsAgo → $expected', ({ yearsAgo, expected }) => {
    const deedDate = new Date(asOf.getTime() - yearsAgo * msPerYear);
    expect(scoreHoldPeriod(deedDate, asOf).points).toBe(expected);
  });

  it('null deedDate → 0 and missing flag', () => {
    expect(scoreHoldPeriod(null, asOf)).toEqual({ points: 0, missingDeedDate: true });
  });
});

describe('scoreAbsentee', () => {
  it('matching addresses → 0', () => {
    expect(
      scoreAbsentee({
        mailingStreet: '200 Elm Street',
        situsAddress: '200 ELM ST',
        mailingState: 'SC',
      }),
    ).toBe(0);
  });

  it('in-state absentee → 15', () => {
    expect(
      scoreAbsentee({
        mailingStreet: '100 Main St',
        situsAddress: '500 Pearl Ave',
        mailingState: 'SC',
      }),
    ).toBe(15);
  });

  it('out-of-state → 25 (not additive)', () => {
    expect(
      scoreAbsentee({
        mailingStreet: '100 Main St',
        situsAddress: '500 Pearl Ave',
        mailingState: 'GA',
      }),
    ).toBe(25);
  });
});

describe('scoreEntity / multiParcel / landUse', () => {
  it('detects LLC entity', () => {
    expect(scoreEntity('ACME HOLDINGS LLC')).toBe(10);
    expect(scoreEntity('JANE DOE')).toBe(0);
    expect(isEntityOwner('FOO L.L.C.')).toBe(true);
  });

  it('multi-parcel threshold at 3', () => {
    expect(scoreMultiParcel(2)).toBe(0);
    expect(scoreMultiParcel(3)).toBe(10);
  });

  it('land use priority capped', () => {
    expect(scoreLandUsePriority('110', { '110': 15 })).toBe(15);
    expect(scoreLandUsePriority('999', { '110': 15 })).toBe(0);
    expect(scoreLandUsePriority('110', { '110': 99 }, 15)).toBe(15);
  });
});

describe('owner + address normalization', () => {
  it('normalizes owner names for dedupe', () => {
    expect(normalizeOwnerName('Acme Holdings, LLC.')).toBe('ACME HOLDINGS LLC');
  });

  it('normalizes street suffixes', () => {
    expect(normalizeAddress('100 Main Street')).toBe('100 MAIN ST');
  });

  it('PO Box counts as absentee', () => {
    expect(
      isAbsenteeOwner({
        mailingStreet: 'PO BOX 123',
        situsAddress: '500 Pearl Ave',
        mailingState: 'SC',
      }),
    ).toBe(true);
  });
});

describe('v2 signal / tax / fmv components', () => {
  it('scores tax delinquency from paidDate null', () => {
    expect(scoreTaxDelinquent({ paidDate: null, totalTax: 1200 })).toBe(15);
    expect(scoreTaxDelinquent({ paidDate: new Date(), totalTax: 1200 })).toBe(0);
  });

  it('boosts investable FMV bands', () => {
    expect(scoreFmvBoost(300_000)).toBe(2);
    expect(scoreFmvBoost(1_000_000)).toBe(4);
    expect(scoreFmvBoost(2_500_000)).toBe(5);
  });

  it('maps signal types to points', () => {
    const pts = scoreSignals(['foreclosure', 'mortgage_maturity', 'sos_dissolved']);
    expect(pts.foreclosure).toBe(25);
    expect(pts.mortgageMaturity).toBe(20);
    expect(pts.sosBoost).toBe(10);
  });
});

describe('scoreParcel integration', () => {
  it('scores out-of-state LLC portfolio owner highly', () => {
    const asOf = new Date('2026-07-24T00:00:00Z');
    const deedDate = new Date('2005-01-01T00:00:00Z');
    const result = scoreParcel({
      deedDate,
      mailingStreet: '100 Main St',
      situsAddress: '500 Pearl Ave',
      mailingState: 'GA',
      ownerName: 'ACME HOLDINGS LLC',
      activeCommercialParcelCount: 5,
      landUseCode: '940',
      landUsePriorityMap: { '940': 15 },
      asOf,
    });

    expect(result.components.holdPeriod).toBe(40);
    expect(result.components.absentee).toBe(25);
    expect(result.components.entity).toBe(10);
    expect(result.components.multiParcel).toBe(10);
    expect(result.components.landUsePriority).toBe(15);
    expect(result.total).toBe(100);
  });

  it('adds distress + FMV without exceeding 100', () => {
    const asOf = new Date('2026-07-24T00:00:00Z');
    const result = scoreParcel({
      deedDate: new Date('2005-01-01T00:00:00Z'),
      mailingStreet: '100 Main St',
      situsAddress: '500 Pearl Ave',
      mailingState: 'GA',
      ownerName: 'ACME HOLDINGS LLC',
      activeCommercialParcelCount: 5,
      landUseCode: '940',
      landUsePriorityMap: { '940': 15 },
      fairMarketVal: 2_000_000,
      totalTax: 5000,
      paidDate: null,
      signalTypes: ['foreclosure'],
      asOf,
    });
    expect(result.components.foreclosure).toBe(25);
    expect(result.components.taxDelinquent).toBe(15);
    expect(result.components.fmvBoost).toBe(5);
    expect(result.total).toBe(100);
  });
});