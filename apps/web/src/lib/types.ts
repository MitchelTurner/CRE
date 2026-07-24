export type LeadStatus = 'new' | 'sent' | 'contacted' | 'dead' | 'deal';

export interface ParcelListItem {
  id: string;
  pin: string;
  situsAddress: string | null;
  landUseCode: string | null;
  propType: string | null;
  deedDate: string | null;
  isAbsentee: boolean | null;
  ownerName: string | null;
  score: number | null;
  scoredAt: string | null;
  components: ScoreComponents | null;
}

export interface ScoreComponents {
  holdPeriod: number;
  absentee: number;
  entity: number;
  multiParcel: number;
  landUsePriority: number;
  missingDeedDate?: boolean;
}

export interface ParcelDetail {
  id: string;
  pin: string;
  situsAddress: string | null;
  landUseCode: string | null;
  landUseDesc: string | null;
  propType: string | null;
  subdivision: string | null;
  deedDate: string | null;
  fairMarketVal: number | null;
  isCommercial: boolean;
  isActive: boolean;
  owner: {
    id: string;
    nameRaw: string;
    mailingAddress: string | null;
    mailingCity: string | null;
    mailingState: string | null;
    isEntity: boolean;
    isAbsentee: boolean;
    parcels: Array<{
      pin: string;
      situsAddress: string | null;
      landUseCode: string | null;
      propType: string | null;
    }>;
  } | null;
  scores: Array<{
    id: string;
    total: number;
    components: ScoreComponents;
    scoredAt: string;
    scoreVersion: string;
  }>;
  signals: Array<{
    id: string;
    type: string;
    payload: unknown;
    detectedAt: string;
  }>;
  leads: Array<{
    id: string;
    status: LeadStatus;
    whyNow: string;
    digestId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface LeadRow {
  id: string;
  status: LeadStatus;
  whyNow: string;
  createdAt: string;
  updatedAt: string;
  parcel: {
    id: string;
    pin: string;
    situsAddress: string | null;
    propType: string | null;
    landUseCode: string | null;
    owner: { nameRaw: string; isAbsentee: boolean; mailingState: string | null } | null;
    scores: Array<{ total: number }>;
  };
}

export interface SyncRun {
  id: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  recordsSeen: number;
  recordsUpserted: number;
  error: string | null;
}

export interface DigestPreview {
  subject: string;
  html: string;
  leads: Array<{
    rank: number;
    pin: string;
    situsAddress: string;
    landUse: string;
    score: number;
    whyNow: string;
    ownerName: string;
  }>;
}