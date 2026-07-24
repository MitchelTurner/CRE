export interface ScoreComponents {
  holdPeriod: number;
  absentee: number;
  entity: number;
  multiParcel: number;
  landUsePriority: number;
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
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  holdPeriodMax: 40,
  absenteeInState: 15,
  absenteeOutOfState: 25,
  entity: 10,
  multiParcel: 10,
  landUsePriorityMax: 15,
};

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
  objectId: 'OBJECTID',
};

/** Default commercial PROPTYPE filter (preferred over LANDUSE when present). */
export const DEFAULT_COMMERCIAL_PROP_TYPES = ['COMMERCIAL', 'INDUSTRIAL', 'MULTI-FAMILY'] as const;

/**
 * LANDUSE codes observed on parcels with commercial PROPTYPEs
 * (COMMERCIAL / INDUSTRIAL / MULTI-FAMILY) during M0 discovery.
 * Tunable via AppConfig; agent can refine.
 */
export const DEFAULT_COMMERCIAL_LANDUSE_CODES = [
  '110',
  '112',
  '113',
  '122',
  '130',
  '140',
  '141',
  '142',
  '143',
  '205',
  '230',
  '240',
  '250',
  '270',
  '271',
  '272',
  '273',
  '300',
  '301',
  '310',
  '320',
  '330',
  '331',
  '332',
  '350',
  '360',
  '370',
  '371',
  '409',
  '410',
  '411',
  '413',
  '414',
  '420',
  '421',
  '423',
  '424',
  '425',
  '430',
  '431',
  '510',
  '511',
  '512',
  '513',
  '520',
  '521',
  '522',
  '523',
  '530',
  '531',
  '532',
  '550',
  '560',
  '561',
  '570',
  '580',
  '581',
  '590',
  '591',
  '610',
  '620',
  '630',
  '631',
  '632',
  '6800',
  '710',
  '720',
  '721',
  '730',
  '740',
  '741',
  '750',
  '751',
  '753',
  '770',
  '780',
  '790',
  '805',
  '810',
  '821',
  '850',
  '851',
  '852',
  '860',
  '872',
  '873',
  '890',
  '891',
  '910',
  '920',
  '930',
  '940',
  '950',
  '960',
  '970',
  '980',
  '990',
] as const;

/** Default land-use priority points (0–15). Higher = more desirable asset class. */
export const DEFAULT_LANDUSE_PRIORITY: Record<string, number> = {
  // Multifamily
  '110': 15,
  '112': 15,
  '113': 12,
  '122': 12,
  // Industrial
  '930': 15,
  '940': 15,
  '950': 14,
  '960': 14,
  '970': 13,
  '990': 10,
  // Office / retail-heavy commercial codes (common high-volume)
  '421': 12,
  '520': 12,
  '6800': 8,
  '410': 11,
  '420': 11,
  '510': 10,
  '610': 10,
  '620': 10,
  '810': 9,
};