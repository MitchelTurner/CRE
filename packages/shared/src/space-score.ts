export type SpaceScoreSignal = {
  id: string;
  type: string;
  weight: number;
  confidence: number;
  occurredAt: Date;
  dismissedAt?: Date | null;
};

const LAMBDA = Math.LN2 / 180;
const MAX_AGE_DAYS = 540;

export function ageDays(occurredAt: Date, now: Date): number {
  return Math.max(0, (now.getTime() - occurredAt.getTime()) / (24 * 60 * 60 * 1000));
}

export function spaceScoreBand(score: number): 'hot' | 'warm' | 'watch' | 'none' {
  if (score >= 60) return 'hot';
  if (score >= 35) return 'warm';
  if (score >= 15) return 'watch';
  return 'none';
}

/** Exponential decay over weighted signals + type-diversity multiplier. */
export function computeSpaceScore(signals: SpaceScoreSignal[], now: Date): {
  score: number;
  bandLabel: string;
  topSignalIds: string[];
} {
  const active = signals
    .filter((s) => !s.dismissedAt)
    .filter((s) => ageDays(s.occurredAt, now) <= MAX_AGE_DAYS)
    .map((s) => {
      const age = ageDays(s.occurredAt, now);
      const contrib = s.weight * s.confidence * Math.exp(-LAMBDA * age);
      return { ...s, contrib };
    })
    .sort((a, b) => b.contrib - a.contrib);

  const raw = active.reduce((acc, s) => acc + s.contrib, 0);
  const distinctTypes = new Set(active.map((s) => s.type)).size;
  const multiplier = 1 + Math.min(0.4, 0.1 * Math.max(0, distinctTypes - 1));
  const score = Math.min(100, raw * multiplier);
  const band = spaceScoreBand(score);

  return {
    score: Math.round(score * 10) / 10,
    bandLabel: band === 'none' ? 'watch' : band,
    topSignalIds: active.slice(0, 5).map((s) => s.id),
  };
}
