import { centroidFromGeometry } from './geometry';

describe('centroidFromGeometry', () => {
  it('reads point geometry', () => {
    expect(centroidFromGeometry({ x: -82.4, y: 34.85 })).toEqual({
      longitude: -82.4,
      latitude: 34.85,
    });
  });

  it('averages polygon rings', () => {
    const c = centroidFromGeometry({
      rings: [
        [
          [-82.4, 34.8],
          [-82.3, 34.8],
          [-82.3, 34.9],
          [-82.4, 34.9],
          [-82.4, 34.8],
        ],
      ],
    });
    expect(c?.longitude).toBeCloseTo(-82.35, 5);
    expect(c?.latitude).toBeCloseTo(34.85, 5);
  });

  it('returns null for empty', () => {
    expect(centroidFromGeometry(null)).toBeNull();
  });
});
