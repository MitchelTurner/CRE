import { normalizeOwnerName } from '@cre/shared';

export type MatchMethod = 'exact' | 'trigram' | 'contact_name' | 'company' | 'manual';

export type MatchCandidate = {
  ownerId: string;
  confidence: number;
  method: MatchMethod;
  ambiguous?: boolean;
};

/** Cap trigram confidence per spec. */
export function capTrigramConfidence(similarity: number): number {
  return Math.min(0.85, Math.max(0, similarity));
}

export function exactConfidence(): number {
  return 0.95;
}

export function companyBridgeConfidence(): number {
  return 0.6;
}

/**
 * Common-name guard: if a normalized name hits 4+ distinct owners, mark ambiguous
 * and exclude from auto-matching.
 */
export function isAmbiguousOwnerCount(distinctOwnerCount: number): boolean {
  return distinctOwnerCount >= 4;
}

export function shouldAutoInclude(match: MatchCandidate): boolean {
  if (match.ambiguous) return false;
  if (match.method === 'exact' || match.method === 'contact_name') {
    return match.confidence >= 0.9;
  }
  if (match.method === 'trigram') return match.confidence > 0.55;
  if (match.method === 'company') return match.confidence >= 0.6;
  return false;
}

/** Rejected pairs must never reappear as auto matches. */
export function filterSuppressed(
  candidates: MatchCandidate[],
  rejectedOwnerIds: Set<string>,
): MatchCandidate[] {
  return candidates.filter((c) => !rejectedOwnerIds.has(c.ownerId));
}

export function normalizePersonName(name: string): string {
  return normalizeOwnerName(name);
}

/**
 * Rank matches for brief: confidence × best parcel score.
 * Pure helper for tests.
 */
export function rankScore(confidence: number, bestParcelScore: number | null): number {
  return confidence * (bestParcelScore ?? 0);
}

export function pickBestMatch(candidates: MatchCandidate[]): MatchCandidate | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}
