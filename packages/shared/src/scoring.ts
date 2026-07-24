import type { ScoreComponents, ScoreWeights, SignalType } from './types';
import { DEFAULT_SCORE_WEIGHTS } from './types';
import { isEntityOwner } from './owner';
import { isAbsenteeOwner, isOutOfState } from './address';

export function yearsSince(deedDate: Date | null | undefined, asOf: Date = new Date()): number | null {
  if (!deedDate) return null;
  const ms = asOf.getTime() - deedDate.getTime();
  if (ms < 0) return 0;
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

export function scoreHoldPeriod(
  deedDate: Date | null | undefined,
  asOf: Date = new Date(),
  maxPoints = DEFAULT_SCORE_WEIGHTS.holdPeriodMax,
): { points: number; missingDeedDate: boolean } {
  const years = yearsSince(deedDate, asOf);
  if (years === null) return { points: 0, missingDeedDate: true };

  let points: number;
  if (years < 3) points = 0;
  else if (years < 7) points = ((years - 3) / 4) * 15;
  else if (years < 10) points = 25;
  else if (years < 15) points = 35;
  else points = 40;

  if (maxPoints !== 40) points = (points / 40) * maxPoints;
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
  if (isOutOfState(input.mailingState, homeState)) return weights.absenteeOutOfState;
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

/** Null/missing paidDate on a taxed parcel ≈ possible delinquency. */
export function scoreTaxDelinquent(input: {
  paidDate: Date | null | undefined;
  totalTax: number | null | undefined;
  points?: number;
}): number {
  const points = input.points ?? DEFAULT_SCORE_WEIGHTS.taxDelinquent;
  if (input.totalTax !== null && input.totalTax !== undefined && input.totalTax > 0 && !input.paidDate) {
    return points;
  }
  return 0;
}

/** Small boost for investable FMV bands. */
export function scoreFmvBoost(
  fairMarketVal: number | null | undefined,
  maxPoints = DEFAULT_SCORE_WEIGHTS.fmvBoostMax,
): number {
  if (!fairMarketVal || fairMarketVal <= 0) return 0;
  if (fairMarketVal >= 2_000_000) return maxPoints;
  if (fairMarketVal >= 750_000) return Math.round(maxPoints * 0.7);
  if (fairMarketVal >= 250_000) return Math.round(maxPoints * 0.4);
  return 0;
}

export function scoreSignals(
  signalTypes: SignalType[],
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): Pick<
  ScoreComponents,
  'mortgageMaturity' | 'foreclosure' | 'recentSeller' | 'sosBoost' | 'taxDelinquent'
> {
  const set = new Set(signalTypes);
  return {
    mortgageMaturity: set.has('mortgage_maturity') ? weights.mortgageMaturity : 0,
    foreclosure: set.has('foreclosure') ? weights.foreclosure : 0,
    recentSeller: set.has('recent_seller') ? weights.recentSeller : 0,
    sosBoost: set.has('sos_dissolved')
      ? weights.sosDissolved
      : set.has('sos_resolved')
        ? weights.sosResolved
        : 0,
    taxDelinquent: set.has('tax_delinquent') ? weights.taxDelinquent : 0,
  };
}

export function computeTotal(components: ScoreComponents): number {
  const total =
    components.holdPeriod +
    components.absentee +
    components.entity +
    components.multiParcel +
    components.landUsePriority +
    components.taxDelinquent +
    components.mortgageMaturity +
    components.foreclosure +
    components.recentSeller +
    components.sosBoost +
    components.fmvBoost;
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
  paidDate?: Date | null;
  totalTax?: number | null;
  fairMarketVal?: number | null;
  signalTypes?: SignalType[];
  homeState?: string;
  weights?: ScoreWeights;
  asOf?: Date;
}): { total: number; components: ScoreComponents } {
  const weights = input.weights ?? DEFAULT_SCORE_WEIGHTS;
  const hold = scoreHoldPeriod(input.deedDate, input.asOf, weights.holdPeriodMax);
  const fromSignals = scoreSignals(input.signalTypes ?? [], weights);

  // Prefer explicit tax signal; else derive from parcel fields.
  const taxFromFields = scoreTaxDelinquent({
    paidDate: input.paidDate,
    totalTax: input.totalTax,
    points: weights.taxDelinquent,
  });

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
    taxDelinquent: Math.max(fromSignals.taxDelinquent, taxFromFields),
    mortgageMaturity: fromSignals.mortgageMaturity,
    foreclosure: fromSignals.foreclosure,
    recentSeller: fromSignals.recentSeller,
    sosBoost: fromSignals.sosBoost,
    fmvBoost: scoreFmvBoost(input.fairMarketVal, weights.fmvBoostMax),
  };

  if (hold.missingDeedDate) components.missingDeedDate = true;
  return { total: computeTotal(components), components };
}

/** Inferred maturity windows commonly used for CRE debt. */
export function inferMortgageMaturityDates(origination: Date): Date[] {
  return [5, 7, 10].map((years) => {
    const d = new Date(origination);
    d.setFullYear(d.getFullYear() + years);
    return d;
  });
}

export function isMaturityWithinMonths(
  maturity: Date,
  months = 18,
  asOf: Date = new Date(),
): boolean {
  const ms = maturity.getTime() - asOf.getTime();
  const monthMs = 30.44 * 24 * 60 * 60 * 1000;
  return ms >= -monthMs && ms <= months * monthMs;
}
