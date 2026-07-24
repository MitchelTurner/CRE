export const QUEUES = {
  INGESTION: 'ingestion',
  SCORING: 'scoring',
  ENRICHMENT: 'enrichment',
  DIGEST: 'digest',
} as const;

export const JOBS = {
  PARCELS_FULL_SYNC: 'parcels.fullSync',
  PARCELS_DAILY_SYNC: 'parcels.dailySync',
  SCORING_RUN_ALL: 'scoring.runAll',
  ENRICHMENT_PASS: 'enrichment.pass',
  DIGEST_WEEKLY: 'digest.weekly',
} as const;