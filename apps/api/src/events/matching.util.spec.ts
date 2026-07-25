import {
  capTrigramConfidence,
  companyBridgeConfidence,
  exactConfidence,
  filterSuppressed,
  isAmbiguousOwnerCount,
  normalizePersonName,
  pickBestMatch,
  rankScore,
  shouldAutoInclude,
  type MatchCandidate,
} from './matching.util';

describe('matching.util (M5 tiers)', () => {
  it('normalizes person names like owners', () => {
    expect(normalizePersonName('Acme Holdings, LLC.')).toBe('ACME HOLDINGS LLC');
  });

  it('exact tier uses 0.95 confidence', () => {
    expect(exactConfidence()).toBe(0.95);
  });

  it('caps trigram confidence at 0.85', () => {
    expect(capTrigramConfidence(0.99)).toBe(0.85);
    expect(capTrigramConfidence(0.6)).toBe(0.6);
  });

  it('company bridge is 0.6', () => {
    expect(companyBridgeConfidence()).toBe(0.6);
  });

  it('ambiguity guard trips at 4+ owners', () => {
    expect(isAmbiguousOwnerCount(3)).toBe(false);
    expect(isAmbiguousOwnerCount(4)).toBe(true);
  });

  it('shouldAutoInclude respects thresholds and ambiguity', () => {
    expect(
      shouldAutoInclude({ ownerId: 'a', confidence: 0.95, method: 'exact' }),
    ).toBe(true);
    expect(
      shouldAutoInclude({
        ownerId: 'a',
        confidence: 0.95,
        method: 'exact',
        ambiguous: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoInclude({ ownerId: 'a', confidence: 0.5, method: 'trigram' }),
    ).toBe(false);
    expect(
      shouldAutoInclude({ ownerId: 'a', confidence: 0.56, method: 'trigram' }),
    ).toBe(true);
    expect(
      shouldAutoInclude({ ownerId: 'a', confidence: 0.6, method: 'company' }),
    ).toBe(true);
  });

  it('suppresses rejected owner pairs', () => {
    const candidates: MatchCandidate[] = [
      { ownerId: 'keep', confidence: 0.95, method: 'exact' },
      { ownerId: 'reject', confidence: 0.95, method: 'exact' },
    ];
    expect(filterSuppressed(candidates, new Set(['reject']))).toEqual([
      candidates[0],
    ]);
  });

  it('ranks by confidence × parcel score', () => {
    expect(rankScore(0.95, 80)).toBeCloseTo(76);
    expect(rankScore(1, null)).toBe(0);
  });

  it('pickBestMatch chooses highest confidence', () => {
    const best = pickBestMatch([
      { ownerId: 'a', confidence: 0.6, method: 'company' },
      { ownerId: 'b', confidence: 0.95, method: 'exact' },
    ]);
    expect(best?.ownerId).toBe('b');
    expect(pickBestMatch([])).toBeNull();
  });
});
