import type { ScoreComponents, ScoreWeights } from './types';
import { DEFAULT_SCORE_WEIGHTS } from './types';
import { isEntityOwner } from './owner';
import { isAbsenteeOwner, isOutOfState } from './address';

export function yearsSince(deedDate: Date | null | undefined, asOf: Date = new Date()): number | null {
  if (!deedDate) return null;
  const ms = asOf.getTime() - deedDate.getTime();
  if (ms < 0) return 0;
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Hold period: <3y → 0; 3–7y → linear 0→15; 7–10y → 25; 10–15y → 35; 15y+ → 40.
 * Null deedDate → 0.
 */
export function scoreHoldPeriod(
  deedDate: Date | null | undefined,
  asOf: Date = new Date(),
  maxPoints = DEFAULT_SCORE_WEIGHTS.holdPeriodMax,
): { points: number; missingDeedDate: boolean } {
  const years = yearsSince(deedDate, asOf);
  if (years === null) return { points: 0, missingDeedDate: true };

  let points: number;
  if (years < 3) {
    points = 0;
  } else if (years < 7) {
    points = ((years - 3) / 4) * 15;
  } else if (years < 10) {
    points = 25;
  } else if (years < 15) {
    points = 35;
  } else {
    points = 40;
  }

  if (maxPoints !== 40) {
    points = (points / 40) * maxPoints;
  }

  return { points: Math.round(points), missingDeedDate: false };
}

export function scoreAbsentee(input: {
  mailingStreet: string | null | undefined;
  situsAddress: string | null | undefined;
  mailingState?: string | null | undefined;
  homeState?: string;
  weights?: Pick<ScoreWeights, 'absenteeInState' | 'absenteeOutOfState'>;
}): number {
  const weights = input.weights ?? DEFAULT_SCORE_WEIGHTS;
  const homeState = input.homeState ?? 'SC';

  if (!isAbsenteeOwner({ ...input, homeState })) return 0;

  if (isOutOfState(input.mailingState, homeState)) {
    return weights.absenteeOutOfState;
  }
  return weights.absenteeInState;
}

export function scoreEntity(ownerName: string, points = DEFAULT_SCORE_WEIGHTS.entity): number {
  return isEntityOwner(ownerName) ? points : 0;
}

export function scoreMultiParcel(
  activeCommercialParcelCount: number,
  points = DEFAULT_SCORE_WEIGHTS.multiParcel,
): number {
  return activeCommercialParcelCount >= 3 ? points : 0;
}

export function scoreLandUsePriority(
  landUseCode: string | null | undefined,
  priorityMap: Record<string, number>,
  maxPoints = DEFAULT_SCORE_WEIGHTS.landUsePriorityMax,
): number {
  if (!landUseCode) return 0;
  const raw = priorityMap[landUseCode] ?? 0;
  return Math.min(Math.max(0, raw), maxPoints);
}

export function computeTotal(components: ScoreComponents): number {
  const total =
    components.holdPeriod +
    components.absentee +
    components.entity +
    components.multiParcel +
    components.landUsePriority;
  return Math.min(100, Math.max(0, Math.round(total)));
}

export function scoreParcel(input: {
  deedDate: Date | null | undefined;
  mailingStreet: string | null | undefined;
  situsAddress: string | null | undefined;
  mailingState?: string | null | undefined;
  ownerName: string;
  activeCommercialParcelCount: number;
  landUseCode: string | null | undefined;
  landUsePriorityMap: Record<string, number>;
  homeState?: string;
  weights?: ScoreWeights;
  asOf?: Date;
}): { total: number; components: ScoreComponents } {
  const weights = input.weights ?? DEFAULT_SCORE_WEIGHTS;
  const hold = scoreHoldPeriod(input.deedDate, input.asOf, weights.holdPeriodMax);

  const components: ScoreComponents = {
    holdPeriod: hold.points,
    absentee: scoreAbsentee({
      mailingStreet: input.mailingStreet,
      situsAddress: input.situsAddress,
      mailingState: input.mailingState,
      homeState: input.homeState,
      weights,
    }),
    entity: scoreEntity(input.ownerName, weights.entity),
    multiParcel: scoreMultiParcel(input.activeCommercialParcelCount, weights.multiParcel),
    landUsePriority: scoreLandUsePriority(
      input.landUseCode,
      input.landUsePriorityMap,
      weights.landUsePriorityMax,
    ),
  };

  if (hold.missingDeedDate) {
    components.missingDeedDate = true;
  }

  return { total: computeTotal(components), components };
}