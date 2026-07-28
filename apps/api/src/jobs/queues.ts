export const QUEUES = {
  INGESTION: 'ingestion',
  SCORING: 'scoring',
  ENRICHMENT: 'enrichment',
  DIGEST: 'digest',
  EVENTS: 'events',
  REPORTS: 'reports',
  SIGNALS: 'signals',
} as const;

export const JOBS = {
  PARCELS_FULL_SYNC: 'parcels.fullSync',
  PARCELS_DAILY_SYNC: 'parcels.dailySync',
  SCORING_RUN_ALL: 'scoring.runAll',
  ENRICHMENT_PASS: 'enrichment.pass',
  ROD_WATCH: 'rod.watch',
  TAX_DELINQUENCY_SYNC: 'tax.delinquencySync',
  DIGEST_WEEKLY: 'digest.weekly',
  EVENTS_SYNC_ALL: 'events.syncAll',
  EVENTS_AUTO_BRIEFS: 'events.autoBriefs',
  REPORTS_QUARTERLY: 'reports.quarterly',
  SIGNALS_RUN_SOURCE: 'signals.runSource',
  SIGNALS_SCORE_NIGHTLY: 'signals.scoreNightly',
} as const;