import { assignSubmarket, scoreLoanPressure, scoreTaxSeverity, scoreSubmarketFit } from '@cre/shared';

describe('submarkets + insight scoring helpers', () => {
  it('assigns downtown Greenville', () => {
    expect(assignSubmarket(34.85, -82.4)).toBe('downtown');
  });

  it('falls back to county_other outside boxes', () => {
    expect(assignSubmarket(34.7, -82.5)).toBe('county_other');
  });

  it('scores tax severity by amount', () => {
    expect(scoreTaxSeverity({ totalTax: 100_000 })).toBe(8);
    expect(scoreTaxSeverity({ totalTax: 60_000 })).toBe(6);
    expect(scoreTaxSeverity({ totalTax: 20_000 })).toBe(4);
    expect(scoreTaxSeverity({ totalTax: 0 })).toBe(0);
  });

  it('scores loan pressure only with maturity', () => {
    expect(
      scoreLoanPressure({ loanAmount: 1_000_000, fairMarketVal: 1_200_000, hasMaturitySignal: true }),
    ).toBe(8);
    expect(
      scoreLoanPressure({ loanAmount: 1_000_000, fairMarketVal: 1_200_000, hasMaturitySignal: false }),
    ).toBe(0);
  });

  it('scores priority submarkets', () => {
    expect(scoreSubmarketFit('downtown')).toBe(4);
    expect(scoreSubmarketFit('county_other')).toBe(0);
  });
});
