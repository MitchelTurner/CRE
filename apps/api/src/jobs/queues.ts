export const QUEUES = {
  INGESTION: 'ingestion',
  SCORING: 'scoring',
  ENRICHMENT: 'enrichment',
  DIGEST: 'digest',
  EVENTS: 'events',
  REPORTS: 'reports',
} as const;

export const JOBS = {
  PARCELS_FULL_SYNC: 'parcels.fullSync',
  PARCELS_DAILY_SYNC: 'parcels.dailySync',
  SCORING_RUN_ALL: 'scoring.runAll',
  ENRICHMENT_PASS: 'enrichment.pass',
  DIGEST_WEEKLY: 'digest.weekly',
  EVENTS_SYNC_ALL: 'events.syncAll',
  EVENTS_AUTO_BRIEFS: 'events.autoBriefs',
  REPORTS_QUARTERLY: 'reports.quarterly',
} as const;