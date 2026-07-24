export type LeadStatus = 'new' | 'sent' | 'contacted' | 'dead' | 'deal';
export type FeedbackRating = 'up' | 'down';

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
  taxDelinquent?: number;
  mortgageMaturity?: number;
  foreclosure?: number;
  recentSeller?: number;
  sosBoost?: number;
  fmvBoost?: number;
  oosDecay?: number;
  portfolioCluster?: number;
  zoningWatch?: number;
  permitActivity?: number;
  nearbyListing?: number;
  probateEstate?: number;
  floodRisk?: number;
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
  salePrice: number | null;
  totalTax: number | null;
  paidDate: string | null;
  latitude: number | null;
  longitude: number | null;
  floodZone: string | null;
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
    clusterKey?: string | null;
    portfolioScore?: number | null;
    relatedOwnerIds?: string[] | null;
    sosEntityId?: string | null;
    sosStatus?: string | null;
    sosRegisteredAgent?: string | null;
    sosAgentAddress?: string | null;
    sosFetchedAt?: string | null;
    contacts?: Array<{
      id: string;
      name: string | null;
      role: string | null;
      phone: string | null;
      email: string | null;
      source: string;
    }>;
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
    expiresAt?: string | null;
  }>;
  leads: Array<{
    id: string;
    status: LeadStatus;
    leadType?: string;
    whyNow: string;
    digestId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface LeadRow {
  id: string;
  status: LeadStatus;
  leadType?: string;
  whyNow: string;
  createdAt: string;
  updatedAt: string;
  feedback?: Array<{ rating: FeedbackRating; note: string | null; createdAt: string }>;
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
    hot?: boolean;
  }>;
  hotLeads?: DigestPreview['leads'];
  evergreenLeads?: DigestPreview['leads'];
}

export interface MapPoint {
  id: string;
  pin: string;
  situsAddress: string | null;
  latitude: number;
  longitude: number;
  score: number | null;
  propType: string | null;
}

export interface OutreachDrafts {
  pin: string;
  callScript: string;
  emailSubject: string;
  emailBody: string;
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
    role: string | null;
    source: string;
  } | null;
}

export interface HitlReview {
  id: string;
  status: string;
  reasons: string[];
  note: string | null;
  parcel: {
    pin: string;
    situsAddress: string | null;
    owner: { nameRaw: string } | null;
    scores: Array<{ total: number }>;
  };
}
