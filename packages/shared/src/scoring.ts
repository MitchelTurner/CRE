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

/** Extra urgency from tax amount (and optional years delinquent). */
export function scoreTaxSeverity(input: {
  totalTax: number | null | undefined;
  yearsDelinquent?: number | null;
  maxPoints?: number;
}): number {
  const maxPoints = input.maxPoints ?? DEFAULT_SCORE_WEIGHTS.taxSeverityMax;
  const tax = input.totalTax ?? 0;
  if (tax <= 0) return 0;
  let pts = 0;
  if (tax >= 100_000) pts = maxPoints;
  else if (tax >= 50_000) pts = Math.round(maxPoints * 0.75);
  else if (tax >= 15_000) pts = Math.round(maxPoints * 0.5);
  else if (tax >= 5_000) pts = Math.round(maxPoints * 0.3);
  const years = input.yearsDelinquent ?? 0;
  if (years >= 3) pts = Math.min(maxPoints, pts + 2);
  else if (years >= 2) pts = Math.min(maxPoints, pts + 1);
  return pts;
}

/** Loan amount vs FMV — larger leverage near maturity = more pressure. */
export function scoreLoanPressure(input: {
  loanAmount: number | null | undefined;
  fairMarketVal: number | null | undefined;
  hasMaturitySignal?: boolean;
  maxPoints?: number;
}): number {
  const maxPoints = input.maxPoints ?? DEFAULT_SCORE_WEIGHTS.loanPressureMax;
  if (!input.hasMaturitySignal) return 0;
  const loan = input.loanAmount ?? 0;
  const fmv = input.fairMarketVal ?? 0;
  if (loan <= 0) return Math.round(maxPoints * 0.25);
  if (fmv > 0) {
    const ltv = loan / fmv;
    if (ltv >= 0.75) return maxPoints;
    if (ltv >= 0.5) return Math.round(maxPoints * 0.7);
    if (ltv >= 0.3) return Math.round(maxPoints * 0.4);
  }
  if (loan >= 2_000_000) return maxPoints;
  if (loan >= 750_000) return Math.round(maxPoints * 0.6);
  return Math.round(maxPoints * 0.3);
}

export function scoreSubmarketFit(
  submarket: string | null | undefined,
  priorityIds: string[] = ['downtown', 'woodruff', 'airport', 'pelham'],
  maxPoints = DEFAULT_SCORE_WEIGHTS.submarketFitMax,
): number {
  if (!submarket) return 0;
  return priorityIds.includes(submarket) ? maxPoints : 0;
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

/**
 * Extra points for out-of-state landlords with long holds:
 * yearsHeld × distance-from-home proxy (state mismatch).
 */
export function scoreOosDecay(input: {
  deedDate: Date | null | undefined;
  mailingState?: string | null;
  homeState?: string;
  isAbsentee?: boolean;
  maxPoints?: number;
  asOf?: Date;
}): number {
  const maxPoints = input.maxPoints ?? DEFAULT_SCORE_WEIGHTS.oosDecayMax;
  const homeState = input.homeState ?? 'SC';
  if (!input.isAbsentee || !isOutOfState(input.mailingState, homeState)) return 0;
  const years = yearsSince(input.deedDate, input.asOf);
  if (years === null || years < 7) return 0;
  if (years >= 20) return maxPoints;
  if (years >= 15) return Math.round(maxPoints * 0.8);
  if (years >= 10) return Math.round(maxPoints * 0.55);
  return Math.round(maxPoints * 0.35);
}

/** Related owners / shared agent / mailing cluster size. */
export function scorePortfolioCluster(
  relatedCommercialParcelCount: number,
  maxPoints = DEFAULT_SCORE_WEIGHTS.portfolioClusterMax,
): number {
  if (relatedCommercialParcelCount >= 10) return maxPoints;
  if (relatedCommercialParcelCount >= 6) return Math.round(maxPoints * 0.75);
  if (relatedCommercialParcelCount >= 3) return Math.round(maxPoints * 0.5);
  return 0;
}

export function scoreSignals(
  signalTypes: SignalType[],
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): Pick<
  ScoreComponents,
  | 'mortgageMaturity'
  | 'foreclosure'
  | 'recentSeller'
  | 'sosBoost'
  | 'taxDelinquent'
  | 'zoningWatch'
  | 'permitActivity'
  | 'nearbyListing'
  | 'probateEstate'
  | 'floodRisk'
  | 'portfolioCluster'
  | 'judgmentLien'
  | 'vacancyProxy'
> {
  const set = new Set(signalTypes);
  return {
    mortgageMaturity: set.has('mortgage_maturity') ? weights.mortgageMaturity : 0,
    foreclosure: set.has('foreclosure') || set.has('tax_sale') ? weights.foreclosure : 0,
    recentSeller:
      set.has('recent_seller') || set.has('deed_comp') ? weights.recentSeller : 0,
    sosBoost: set.has('sos_dissolved')
      ? weights.sosDissolved
      : set.has('sos_resolved')
        ? weights.sosResolved
        : 0,
    taxDelinquent: set.has('tax_delinquent') ? weights.taxDelinquent : 0,
    zoningWatch: set.has('zoning_change') ? weights.zoningWatch : 0,
    permitActivity: set.has('permit_activity') ? weights.permitActivity : 0,
    nearbyListing: set.has('nearby_listing') ? weights.nearbyListing : 0,
    probateEstate: set.has('probate_estate') ? weights.probateEstate : 0,
    floodRisk: set.has('flood_zone') ? weights.floodRisk : 0,
    portfolioCluster: set.has('related_entity') ? Math.round(weights.portfolioClusterMax * 0.5) : 0,
    judgmentLien: set.has('judgment_lien') ? weights.judgmentLien : 0,
    vacancyProxy: set.has('vacancy_proxy') ? weights.vacancyProxy : 0,
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
    (components.taxSeverity ?? 0) +
    components.mortgageMaturity +
    (components.loanPressure ?? 0) +
    components.foreclosure +
    components.recentSeller +
    components.sosBoost +
    components.fmvBoost +
    components.oosDecay +
    components.portfolioCluster +
    components.zoningWatch +
    components.permitActivity +
    components.nearbyListing +
    components.probateEstate +
    components.floodRisk +
    (components.judgmentLien ?? 0) +
    (components.vacancyProxy ?? 0) +
    (components.submarketFit ?? 0);
  return Math.min(100, Math.max(0, Math.round(total)));
}

export function scoreParcel(input: {
  deedDate: Date | null | undefined;
  mailingStreet: string | null | undefined;
  situsAddress: string | null | undefined;
  mailingState?: string | null | undefined;
  ownerName: string;
  activeCommercialParcelCount: number;
  relatedCommercialParcelCount?: number;
  landUseCode: string | null | undefined;
  landUsePriorityMap: Record<string, number>;
  paidDate?: Date | null;
  totalTax?: number | null;
  fairMarketVal?: number | null;
  loanAmount?: number | null;
  yearsDelinquent?: number | null;
  submarket?: string | null;
  prioritySubmarkets?: string[];
  signalTypes?: SignalType[];
  homeState?: string;
  weights?: ScoreWeights;
  asOf?: Date;
}): { total: number; components: ScoreComponents } {
  const weights = input.weights ?? DEFAULT_SCORE_WEIGHTS;
  const hold = scoreHoldPeriod(input.deedDate, input.asOf, weights.holdPeriodMax);
  const fromSignals = scoreSignals(input.signalTypes ?? [], weights);
  const absentee = scoreAbsentee({
    mailingStreet: input.mailingStreet,
    situsAddress: input.situsAddress,
    mailingState: input.mailingState,
    homeState: input.homeState,
    weights,
  });

  const taxFromFields = scoreTaxDelinquent({
    paidDate: input.paidDate,
    totalTax: input.totalTax,
    points: weights.taxDelinquent,
  });
  const taxDelinquent = Math.max(fromSignals.taxDelinquent, taxFromFields);

  const relatedCount =
    input.relatedCommercialParcelCount ?? input.activeCommercialParcelCount;
  const clusterFromCount = scorePortfolioCluster(relatedCount, weights.portfolioClusterMax);

  const components: ScoreComponents = {
    holdPeriod: hold.points,
    absentee,
    entity: scoreEntity(input.ownerName, weights.entity),
    multiParcel: scoreMultiParcel(input.activeCommercialParcelCount, weights.multiParcel),
    landUsePriority: scoreLandUsePriority(
      input.landUseCode,
      input.landUsePriorityMap,
      weights.landUsePriorityMax,
    ),
    taxDelinquent,
    taxSeverity:
      taxDelinquent > 0
        ? scoreTaxSeverity({
            totalTax: input.totalTax,
            yearsDelinquent: input.yearsDelinquent,
            maxPoints: weights.taxSeverityMax,
          })
        : 0,
    mortgageMaturity: fromSignals.mortgageMaturity,
    loanPressure: scoreLoanPressure({
      loanAmount: input.loanAmount,
      fairMarketVal: input.fairMarketVal,
      hasMaturitySignal: fromSignals.mortgageMaturity > 0,
      maxPoints: weights.loanPressureMax,
    }),
    foreclosure: fromSignals.foreclosure,
    recentSeller: fromSignals.recentSeller,
    sosBoost: fromSignals.sosBoost,
    fmvBoost: scoreFmvBoost(input.fairMarketVal, weights.fmvBoostMax),
    oosDecay: scoreOosDecay({
      deedDate: input.deedDate,
      mailingState: input.mailingState,
      homeState: input.homeState,
      isAbsentee: absentee > 0,
      maxPoints: weights.oosDecayMax,
      asOf: input.asOf,
    }),
    portfolioCluster: Math.max(clusterFromCount, fromSignals.portfolioCluster),
    zoningWatch: fromSignals.zoningWatch,
    permitActivity: fromSignals.permitActivity,
    nearbyListing: fromSignals.nearbyListing,
    probateEstate: fromSignals.probateEstate,
    floodRisk: fromSignals.floodRisk,
    judgmentLien: fromSignals.judgmentLien,
    vacancyProxy: fromSignals.vacancyProxy,
    submarketFit: scoreSubmarketFit(
      input.submarket,
      input.prioritySubmarkets,
      weights.submarketFitMax,
    ),
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

/** Merge stored AppConfig weights with defaults so v2 rows still work. */
export function mergeScoreWeights(partial: Partial<ScoreWeights> | null | undefined): ScoreWeights {
  return { ...DEFAULT_SCORE_WEIGHTS, ...(partial ?? {}) };
}
