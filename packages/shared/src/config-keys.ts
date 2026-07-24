export const CONFIG_KEYS = {
  COMMERCIAL_LANDUSE_CODES: 'commercial_landuse_codes',
  COMMERCIAL_PROP_TYPES: 'commercial_prop_types',
  SCORE_WEIGHTS: 'score_weights',
  LANDUSE_PRIORITY: 'landuse_priority',
  FIELD_MAP: 'field_map',
  DIGEST_FMV_FLOOR: 'digest_fmv_floor',
  COUNTY_SLUG: 'county_slug',
} as const;

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];