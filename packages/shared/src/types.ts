export interface ScoreComponents {
  holdPeriod: number;
  absentee: number;
  entity: number;
  multiParcel: number;
  landUsePriority: number;
  taxDelinquent: number;
  /** Extra points when tax amount / severity is high. */
  taxSeverity: number;
  mortgageMaturity: number;
  /** Extra when loan amount is material vs FMV. */
  loanPressure: number;
  foreclosure: number;
  recentSeller: number;
  sosBoost: number;
  fmvBoost: number;
  /** Out-of-state long-hold landlord decay. */
  oosDecay: number;
  /** Related-entity / portfolio cluster boost. */
  portfolioCluster: number;
  zoningWatch: number;
  permitActivity: number;
  nearbyListing: number;
  probateEstate: number;
  floodRisk: number;
  judgmentLien: number;
  vacancyProxy: number;
  submarketFit: number;
  /** Present when deedDate is missing — hold period scored 0. */
  missingDeedDate?: boolean;
}

export interface ScoreWeights {
  holdPeriodMax: number;
  absenteeInState: number;
  absenteeOutOfState: number;
  entity: number;
  multiParcel: number;
  landUsePriorityMax: number;
  taxDelinquent: number;
  taxSeverityMax: number;
  mortgageMaturity: number;
  loanPressureMax: number;
  foreclosure: number;
  recentSeller: number;
  sosDissolved: number;
  sosResolved: number;
  fmvBoostMax: number;
  oosDecayMax: number;
  portfolioClusterMax: number;
  zoningWatch: number;
  permitActivity: number;
  nearbyListing: number;
  probateEstate: number;
  floodRisk: number;
  judgmentLien: number;
  vacancyProxy: number;
  submarketFitMax: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  holdPeriodMax: 40,
  absenteeInState: 15,
  absenteeOutOfState: 25,
  entity: 10,
  multiParcel: 10,
  landUsePriorityMax: 15,
  taxDelinquent: 15,
  taxSeverityMax: 8,
  mortgageMaturity: 20,
  loanPressureMax: 8,
  foreclosure: 25,
  recentSeller: 8,
  sosDissolved: 10,
  sosResolved: 3,
  fmvBoostMax: 5,
  oosDecayMax: 10,
  portfolioClusterMax: 8,
  zoningWatch: 12,
  permitActivity: 8,
  nearbyListing: 6,
  probateEstate: 18,
  floodRisk: 4,
  judgmentLien: 12,
  vacancyProxy: 7,
  submarketFitMax: 4,
};

export type SignalType =
  | 'tax_delinquent'
  | 'mortgage_maturity'
  | 'foreclosure'
  | 'recent_seller'
  | 'sos_dissolved'
  | 'sos_resolved'
  | 'zoning_change'
  | 'permit_activity'
  | 'nearby_listing'
  | 'probate_estate'
  | 'flood_zone'
  | 'related_entity'
  | 'tax_sale'
  | 'deed_comp'
  | 'judgment_lien'
  | 'vacancy_proxy';

/** Catalyst signals that qualify a lead for the digest "Hot this week" section. */
export const HOT_SIGNAL_TYPES: SignalType[] = [
  'tax_delinquent',
  'mortgage_maturity',
  'foreclosure',
  'recent_seller',
  'sos_dissolved',
  'zoning_change',
  'permit_activity',
  'nearby_listing',
  'probate_estate',
  'tax_sale',
  'judgment_lien',
  'vacancy_proxy',
  'deed_comp',
];

export interface FieldMap {
  pin: string;
  ownerName1: string;
  ownerName2: string;
  mailingStreet: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  situsNumber: string;
  situsStreet: string;
  deedDate: string;
  landUse: string;
  subdivision: string;
  propType: string;
  fairMarketVal: string;
  salePrice: string;
  totalTax: string;
  paidDate: string;
  objectId: string;
}

/** Verified against Greenville County layer 52 metadata (2026-07-24). */
export const DEFAULT_FIELD_MAP: FieldMap = {
  pin: 'PIN',
  ownerName1: 'OWNAM1',
  ownerName2: 'OWNAM2',
  mailingStreet: 'STREET',
  mailingCity: 'CITY',
  mailingState: 'STATE',
  mailingZip: 'ZIP5',
  situsNumber: 'STRNUM',
  situsStreet: 'LOCATE',
  deedDate: 'DEEDDATE',
  landUse: 'LANDUSE',
  subdivision: 'SUBDIV',
  propType: 'PROPTYPE',
  fairMarketVal: 'FAIRMKTVAL',
  salePrice: 'SLPRICE',
  totalTax: 'TOTTAX',
  paidDate: 'PAIDDATE',
  objectId: 'OBJECTID',
};

export const DEFAULT_COMMERCIAL_PROP_TYPES = ['COMMERCIAL', 'INDUSTRIAL', 'MULTI-FAMILY'] as const;

export const DEFAULT_COMMERCIAL_LANDUSE_CODES = [
  '110', '112', '113', '122', '130', '140', '141', '142', '143', '205', '230', '240', '250',
  '270', '271', '272', '273', '300', '301', '310', '320', '330', '331', '332', '350', '360',
  '370', '371', '409', '410', '411', '413', '414', '420', '421', '423', '424', '425', '430',
  '431', '510', '511', '512', '513', '520', '521', '522', '523', '530', '531', '532', '550',
  '560', '561', '570', '580', '581', '590', '591', '610', '620', '630', '631', '632', '6800',
  '710', '720', '721', '730', '740', '741', '750', '751', '753', '770', '780', '790', '805',
  '810', '821', '850', '851', '852', '860', '872', '873', '890', '891', '910', '920', '930',
  '940', '950', '960', '970', '980', '990',
] as const;

export const DEFAULT_LANDUSE_PRIORITY: Record<string, number> = {
  '110': 15, '112': 15, '113': 12, '122': 12,
  '930': 15, '940': 15, '950': 14, '960': 14, '970': 13, '990': 10,
  '421': 12, '520': 12, '6800': 8, '410': 11, '420': 11, '510': 10,
  '610': 10, '620': 10, '810': 9,
};

/** Minimum FMV for digest inclusion (tunable via AppConfig). */
export const DEFAULT_DIGEST_FMV_FLOOR = 250000;

/** Greenville County approximate map bounds (WGS84). */
export const GREENVILLE_MAP_BOUNDS = {
  minLat: 34.65,
  maxLat: 35.15,
  minLon: -82.65,
  maxLon: -82.15,
};
