export const QUEUES = {
  INGESTION: 'ingestion',
  SCORING: 'scoring',
  DIGEST: 'digest',
} as const;

export const JOBS = {
  PARCELS_FULL_SYNC: 'parcels.fullSync',
  PARCELS_DAILY_SYNC: 'parcels.dailySync',
  SCORING_RUN_ALL: 'scoring.runAll',
  DIGEST_WEEKLY: 'digest.weekly',
} as const;