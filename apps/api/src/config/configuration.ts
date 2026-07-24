import {
  DEFAULT_COMMERCIAL_LANDUSE_CODES,
  DEFAULT_COMMERCIAL_PROP_TYPES,
  DEFAULT_FIELD_MAP,
  DEFAULT_LANDUSE_PRIORITY,
  DEFAULT_SCORE_WEIGHTS,
} from '@cre/shared';
import { resolveRedisUrl } from './redis.connection';

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: resolveRedisUrl(),
  apiToken: (process.env.API_TOKEN ?? '').trim(),
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  digestFrom: process.env.DIGEST_FROM ?? 'leads@example.com',
  digestRecipients: (process.env.DIGEST_RECIPIENTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  digestTopN: parseInt(process.env.DIGEST_TOP_N ?? '10', 10),
  digestExclusionDays: parseInt(process.env.DIGEST_EXCLUSION_DAYS ?? '90', 10),
  digestResendScoreDelta: parseInt(process.env.DIGEST_RESEND_SCORE_DELTA ?? '15', 10),
  arcgis: {
    parcelLayerUrl:
      process.env.ARCGIS_PARCEL_LAYER_URL ??
      'https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/52',
    maxConcurrency: parseInt(process.env.ARCGIS_MAX_CONCURRENCY ?? '2', 10),
    pageDelayMs: parseInt(process.env.ARCGIS_PAGE_DELAY_MS ?? '250', 10),
    userAgent:
      process.env.ARCGIS_USER_AGENT ??
      'GreenvilleCRE-LeadEngine/1.0 (+contact@example.com)',
  },
  scoreVersion: process.env.SCORE_VERSION ?? 'v1',
  countyName: process.env.COUNTY_NAME ?? 'Greenville',
  countyHomeState: process.env.COUNTY_HOME_STATE ?? 'SC',
  countyParcelLinkBase:
    process.env.COUNTY_PARCEL_LINK_BASE ??
    'https://www.greenvillecounty.org/appsas400/RealProperty/',
  rodScraperEnabled: process.env.ROD_SCRAPER_ENABLED === 'true',
  skiptraceWeeklyCap: parseInt(process.env.SKIPTRACE_WEEKLY_CAP ?? '25', 10),
  defaults: {
    fieldMap: DEFAULT_FIELD_MAP,
    commercialLandUseCodes: [...DEFAULT_COMMERCIAL_LANDUSE_CODES],
    commercialPropTypes: [...DEFAULT_COMMERCIAL_PROP_TYPES],
    scoreWeights: DEFAULT_SCORE_WEIGHTS,
    landUsePriority: DEFAULT_LANDUSE_PRIORITY,
  },
});
