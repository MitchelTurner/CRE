import {
  DEFAULT_COMMERCIAL_LANDUSE_CODES,
  DEFAULT_COMMERCIAL_PROP_TYPES,
  DEFAULT_DIGEST_FMV_FLOOR,
  DEFAULT_FIELD_MAP,
  DEFAULT_LANDUSE_PRIORITY,
  DEFAULT_SCORE_WEIGHTS,
  getCountyPreset,
} from '@cre/shared';
import { resolveRedisUrl } from './redis.connection';

const countySlug = (process.env.COUNTY_SLUG ?? 'greenville').trim().toLowerCase();
const countyPreset = getCountyPreset(countySlug);

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
  digestFmvFloor: parseInt(
    process.env.DIGEST_FMV_FLOOR ?? String(DEFAULT_DIGEST_FMV_FLOOR),
    10,
  ),
  arcgis: {
    parcelLayerUrl:
      process.env.ARCGIS_PARCEL_LAYER_URL ?? countyPreset.parcelLayerUrl,
    maxConcurrency: parseInt(process.env.ARCGIS_MAX_CONCURRENCY ?? '2', 10),
    pageDelayMs: parseInt(process.env.ARCGIS_PAGE_DELAY_MS ?? '250', 10),
    userAgent:
      process.env.ARCGIS_USER_AGENT ??
      'GreenvilleCRE-LeadEngine/1.0 (+contact@example.com)',
  },
  scoreVersion: process.env.SCORE_VERSION ?? 'v3',
  countySlug,
  countyName: process.env.COUNTY_NAME ?? countyPreset.name,
  countyHomeState: process.env.COUNTY_HOME_STATE ?? countyPreset.homeState,
  countyParcelLinkBase:
    process.env.COUNTY_PARCEL_LINK_BASE ?? countyPreset.parcelLinkBase,
  rodScraperEnabled: process.env.ROD_SCRAPER_ENABLED === 'true',
  skiptraceWeeklyCap: parseInt(process.env.SKIPTRACE_WEEKLY_CAP ?? '25', 10),
  outreachAgentName: process.env.OUTREACH_AGENT_NAME ?? '',
  crmWebhookUrl: process.env.CRM_WEBHOOK_URL ?? '',
  crmWebhookToken: process.env.CRM_WEBHOOK_TOKEN ?? '',
  crmProvider: process.env.CRM_PROVIDER ?? 'webhook',
  defaults: {
    fieldMap: process.env.ARCGIS_PARCEL_LAYER_URL
      ? DEFAULT_FIELD_MAP
      : countyPreset.fieldMap,
    commercialLandUseCodes: countyPreset.commercialLandUseCodes.length
      ? countyPreset.commercialLandUseCodes
      : [...DEFAULT_COMMERCIAL_LANDUSE_CODES],
    commercialPropTypes: countyPreset.commercialPropTypes.length
      ? countyPreset.commercialPropTypes
      : [...DEFAULT_COMMERCIAL_PROP_TYPES],
    scoreWeights: DEFAULT_SCORE_WEIGHTS,
    landUsePriority: countyPreset.landUsePriority,
    digestFmvFloor: DEFAULT_DIGEST_FMV_FLOOR,
  },
});
