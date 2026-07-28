import { softScoreForTest, buildExplanationForTest } from './requirement-matching.logic';

describe('requirement matching soft score', () => {
  it('rewards clear-height headroom and off-market is applied by caller', () => {
    const score = softScoreForTest(
      { minClearHeight: 32, minDockDoors: 4, minYardAcres: 5 },
      { clearHeightFt: 38, dockDoors: 6, yardAcres: 6.2 },
    );
    expect(score).toBeGreaterThan(40);
  });

  it('builds explanation string', () => {
    const text = buildExplanationForTest(
      {
        minClearHeight: 32,
        minDockDoors: 4,
        minYardAcres: 5,
        railRequired: true,
        minSf: 50000,
        maxSf: null,
      },
      {
        clearHeightFt: 38,
        dockDoors: 6,
        yardAcres: 6.2,
        railServed: true,
        buildingSf: 120000,
      },
      false,
    );
    expect(text).toContain("38' clear vs 32' required");
    expect(text).toContain('rail-served');
    expect(text).toContain('off-market');
  });
});
