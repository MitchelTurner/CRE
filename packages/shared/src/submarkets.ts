/** Hand-drawn Greenville CRE submarket boxes (WGS84). Good enough for tagging + reports. */
export type SubmarketBox = {
  id: string;
  label: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export const GREENVILLE_SUBMARKETS: SubmarketBox[] = [
  { id: 'downtown', label: 'Downtown', minLat: 34.84, maxLat: 34.86, minLon: -82.41, maxLon: -82.38 },
  { id: 'woodruff', label: 'Woodruff Rd', minLat: 34.8, maxLat: 34.86, minLon: -82.3, maxLon: -82.2 },
  { id: 'airport', label: 'Airport / GSP', minLat: 34.85, maxLat: 34.95, minLon: -82.28, maxLon: -82.15 },
  { id: 'pelham', label: 'Pelham Rd', minLat: 34.84, maxLat: 34.9, minLon: -82.35, maxLon: -82.28 },
  { id: 'haywood', label: 'Haywood / Mall', minLat: 34.82, maxLat: 34.86, minLon: -82.35, maxLon: -82.3 },
  { id: 'westside', label: 'Westside / Augusta', minLat: 34.8, maxLat: 34.86, minLon: -82.45, maxLon: -82.41 },
  { id: 'north', label: 'North Greenville', minLat: 34.9, maxLat: 35.1, minLon: -82.5, maxLon: -82.25 },
];

export function assignSubmarket(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  boxes: SubmarketBox[] = GREENVILLE_SUBMARKETS,
): string | null {
  if (latitude == null || longitude == null) return null;
  for (const b of boxes) {
    if (
      latitude >= b.minLat &&
      latitude <= b.maxLat &&
      longitude >= b.minLon &&
      longitude <= b.maxLon
    ) {
      return b.id;
    }
  }
  return 'county_other';
}

/** Optional rent / cap-rate bands for openers (tunable via AppConfig). */
export type SubmarketBand = {
  id: string;
  label: string;
  capRateLow?: number;
  capRateHigh?: number;
  rentPsfNote?: string;
};

export const DEFAULT_SUBMARKET_BANDS: SubmarketBand[] = [
  { id: 'downtown', label: 'Downtown', capRateLow: 5.5, capRateHigh: 7.5, rentPsfNote: 'office/retail premium' },
  { id: 'woodruff', label: 'Woodruff Rd', capRateLow: 6, capRateHigh: 8, rentPsfNote: 'retail corridor' },
  { id: 'airport', label: 'Airport / GSP', capRateLow: 6.5, capRateHigh: 8.5, rentPsfNote: 'industrial / flex' },
  { id: 'pelham', label: 'Pelham Rd', capRateLow: 6, capRateHigh: 8, rentPsfNote: 'medical / office' },
  { id: 'haywood', label: 'Haywood / Mall', capRateLow: 6.5, capRateHigh: 9, rentPsfNote: 'retail' },
  { id: 'westside', label: 'Westside / Augusta', capRateLow: 7, capRateHigh: 9.5, rentPsfNote: 'value-add' },
  { id: 'north', label: 'North Greenville', capRateLow: 6.5, capRateHigh: 8.5, rentPsfNote: 'suburban' },
  { id: 'county_other', label: 'County other', capRateLow: 6.5, capRateHigh: 9 },
];
