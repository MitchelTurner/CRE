import { clearToken, getToken } from './auth';
import type {
  DigestPreview,
  FeedbackRating,
  FeedbackReason,
  HitlReview,
  LeadOutcome,
  LeadRow,
  LeadStatus,
  MapPoint,
  AwardResult,
  NoteKind,
  NoteRow,
  OwnerDetail,
  OutreachDrafts,
  ParcelDetail,
  ParcelListItem,
  ProgressSummary,
  SyncRun,
  TodayDashboard,
  EventRow,
} from './types';



export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const AUTH_LOST_EVENT = 'cre:auth-lost';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Cache-Control', 'no-store');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (res.status === 401 || res.status === 403) {
    clearToken();
    window.dispatchEvent(new Event(AUTH_LOST_EVENT));
    throw new ApiError(res.status, 'Invalid or missing bearer token — sign in again');
  }

  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      res.status,
      `Expected JSON from ${path} but got ${contentType || 'non-JSON'} — API route may be missing or blocked by SPA fallback`,
    );
  }
  return (await res.json()) as T;
}

export interface ParcelListQuery {
  minScore?: number;
  landUse?: string;
  absentee?: boolean;
  hotOnly?: boolean;
  missingContact?: boolean;
  limit?: number;
  offset?: number;
}

export function getTodayDashboard() {
  return request<TodayDashboard>('/dashboard/today');
}

export function listParcels(query: ParcelListQuery = {}) {
  const params = new URLSearchParams();
  if (query.minScore !== undefined) params.set('minScore', String(query.minScore));
  if (query.landUse) params.set('landUse', query.landUse);
  if (query.absentee !== undefined) params.set('absentee', String(query.absentee));
  if (query.hotOnly) params.set('hotOnly', 'true');
  if (query.missingContact) params.set('missingContact', 'true');
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  params.set('sort', 'score');
  const qs = params.toString();
  return request<{ items: ParcelListItem[]; limit: number; offset: number }>(
    `/parcels${qs ? `?${qs}` : ''}`,
  );
}

export function listMapPoints(query: { minScore?: number; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (query.minScore !== undefined) params.set('minScore', String(query.minScore));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const qs = params.toString();
  return request<{
    items: MapPoint[];
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  }>(`/parcels/map${qs ? `?${qs}` : ''}`);
}

export function getParcel(pin: string) {
  return request<ParcelDetail>(`/parcels/${encodeURIComponent(pin)}`);
}

export function getOwner(id: string) {
  return request<OwnerDetail>(`/owners/${encodeURIComponent(id)}`);
}

export function refreshOwnerPeople(id: string) {
  return request<OwnerDetail>(`/owners/${encodeURIComponent(id)}/refresh-people`, {
    method: 'POST',
  });
}


export function getParcelOutreach(pin: string, llm: 'auto' | boolean = 'auto') {
  const params = new URLSearchParams();
  if (llm === true) params.set('llm', '1');
  if (llm === false) params.set('llm', '0');
  const qs = params.toString();
  return request<OutreachDrafts>(
    `/parcels/${encodeURIComponent(pin)}/outreach${qs ? `?${qs}` : ''}`,
  );
}

export function generateParcelOutreach(pin: string) {
  return request<OutreachDrafts>(`/parcels/${encodeURIComponent(pin)}/outreach`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function enrichParcel(pin: string) {
  return request<{
    pin: string;
    sources: Record<string, string>;
    details: Record<string, unknown>;
  }>(`/parcels/${encodeURIComponent(pin)}/enrich`, { method: 'POST' });
}

export function listLeads(status?: LeadStatus, includeSnoozed = false) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (includeSnoozed) params.set('includeSnoozed', 'true');
  const qs = params.toString();
  return request<{ items: LeadRow[] }>(`/leads${qs ? `?${qs}` : ''}`);
}

export function createLead(parcelId: string, whyNow?: string) {
  return request<LeadRow>('/leads', {
    method: 'POST',
    body: JSON.stringify({ parcelId, whyNow }),
  });
}

export function updateLeadStatus(id: string, status: LeadStatus) {
  return request<LeadRow & { award?: AwardResult | null }>(
    `/leads/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
}

export function logLeadOutcome(id: string, outcome: LeadOutcome) {
  return request<LeadRow & { award?: AwardResult | null }>(
    `/leads/${encodeURIComponent(id)}/outcome`,
    {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    },
  );
}

export function getProgress() {
  return request<ProgressSummary>('/progress');
}

export function listNotes(query: {
  kind?: NoteKind | string;
  parcelId?: string;
  personId?: string;
  leadId?: string;
  eventId?: string;
} = {}) {
  const params = new URLSearchParams();
  if (query.kind) params.set('kind', query.kind);
  if (query.parcelId) params.set('parcelId', query.parcelId);
  if (query.personId) params.set('personId', query.personId);
  if (query.leadId) params.set('leadId', query.leadId);
  if (query.eventId) params.set('eventId', query.eventId);
  const qs = params.toString();
  return request<{ items: NoteRow[] }>(`/notes${qs ? `?${qs}` : ''}`);
}

export function createNote(input: {
  kind: NoteKind | string;
  body: string;
  title?: string;
  parcelId?: string;
  personId?: string;
  leadId?: string;
  eventId?: string;
  meetingAt?: string;
}) {
  return request<{ note: NoteRow; award?: AwardResult | null }>('/notes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateNote(
  id: string,
  input: { body?: string; title?: string; meetingAt?: string | null },
) {
  return request<{ note: NoteRow }>(`/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteNote(id: string) {
  return request<{ ok: boolean }>(`/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}


export function snoozeLead(id: string, days: 30 | 90) {
  return request<LeadRow>(`/leads/${encodeURIComponent(id)}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}

export function submitLeadFeedback(
  id: string,
  rating: FeedbackRating,
  note?: string,
  reason?: FeedbackReason,
) {
  return request<LeadRow>(`/leads/${encodeURIComponent(id)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, note, reason }),
  });
}

export function getLeadNeighbors(id: string) {
  return request<{ prevPin: string | null; nextPin: string | null; index: number; total: number }>(
    `/leads/${encodeURIComponent(id)}/neighbors`,
  );
}

export function enqueueSync() {
  return request<{ enqueued: boolean; jobId: string; note?: string }>('/admin/sync', {
    method: 'POST',
  });
}

export function getInventory() {
  return request<{
    total: number;
    active: number;
    activeCommercial: number;
    inactiveCommercial: number;
  }>('/admin/inventory');
}

export function reactivateParcels() {
  return request<{ reactivated: number; note?: string }>('/admin/parcels/reactivate', {
    method: 'POST',
  });
}

export function enqueueEnrich(topN = 25) {
  return request<{ enqueued: boolean; jobId: string; note?: string }>(
    `/admin/enrich?topN=${topN}`,
    { method: 'POST' },
  );
}

export type RodStatus = {
  ready: boolean;
  enabled: boolean;
  credentialsPresent: boolean;
  reason: string;
};

export function getRodStatus() {
  return request<RodStatus>('/admin/rod/status');
}

export function probeRodLogin() {
  return request<RodStatus & { ok: boolean; detail: string }>('/admin/rod/probe', {
    method: 'POST',
  });
}

export function enqueueRodWatch() {
  return request<{
    enqueued: boolean;
    jobId: string;
    note?: string;
    rod?: RodStatus;
  }>('/admin/rod/watch', {
    method: 'POST',
  });
}

export function enqueueTaxSync() {
  return request<{ enqueued: boolean; jobId: string; note?: string }>('/admin/tax/sync', {
    method: 'POST',
  });
}

export function ocrEventAttendees(
  id: string,
  body: {
    imageBase64: string;
    mediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    role?: string;
  },
) {
  return request<{
    linked: number;
    extractedText?: string;
    usedLlm?: boolean;
    award?: AwardResult | null;
  }>(`/events/${encodeURIComponent(id)}/attendees/ocr`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listDriveBys(limit = 50) {
  return request<{
    items: Array<{
      id: string;
      latitude: number;
      longitude: number;
      note: string | null;
      tags: string[];
      distanceM: number | null;
      hasImage: boolean;
      createdAt: string;
      parcel: {
        id: string;
        pin: string;
        situsAddress: string | null;
        score: number | null;
      } | null;
    }>;
  }>(`/drive-by?limit=${limit}`);
}

export function nearestDriveByParcel(lat: number, lng: number, maxMeters = 250) {
  return request<{
    nearest: {
      id: string;
      pin: string;
      situsAddress: string | null;
      distanceM: number;
    } | null;
  }>(`/drive-by/nearest?lat=${lat}&lng=${lng}&maxMeters=${maxMeters}`);
}

export function createDriveBy(body: {
  latitude: number;
  longitude: number;
  note?: string;
  tags?: string[];
  imageBase64?: string;
  mediaType?: string;
  pin?: string;
}) {
  return request<{
    id: string;
    pin: string | null;
    parcelId: string | null;
    distanceM: number | null;
    tags: string[];
    hasImage: boolean;
    note: string | null;
    createdAt: string;
    award?: AwardResult | null;
  }>('/drive-by', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}


export function tuneWeights() {
  return request<{ samples: number; adjusted: Record<string, number> }>(
    '/admin/tune-weights',
    { method: 'POST' },
  );
}

export function syncCrm() {
  return request<{ attempted: number; synced: number; skipped: number }>(
    '/admin/crm/sync',
    { method: 'POST' },
  );
}

export function listHitl(status = 'pending') {
  return request<HitlReview[]>(`/admin/hitl?status=${encodeURIComponent(status)}`);
}

export function refreshHitl(limit = 25) {
  return request<{ created: number }>(`/admin/hitl/refresh?limit=${limit}`, {
    method: 'POST',
  });
}

export function updateHitl(id: string, status: string, note?: string) {
  return request(`/admin/hitl/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  });
}

export function listSyncRuns() {
  return request<SyncRun[]>('/admin/sync-runs?limit=20');
}

export function listActiveJobs() {
  return request<{ items: SyncRun[] }>('/admin/jobs/active');
}

export function previewDigest(excludePins: string[] = []) {
  return request<DigestPreview>('/admin/digest/preview', {
    method: 'POST',
    body: JSON.stringify({ excludePins }),
  });
}

export function sendDigest(excludePins: string[] = []) {
  return request<{ enqueued: boolean; jobId: string; note?: string }>('/admin/digest/send', {
    method: 'POST',
    body: JSON.stringify({ excludePins }),
  });
}

export function listEvents(query: { from?: string; density?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.density) params.set('density', query.density);
  if (query.status) params.set('status', query.status);
  const qs = params.toString();
  return request<{ items: EventRow[] }>(`/events${qs ? `?${qs}` : ''}`);
}

export function syncEvents() {
  return request<{ enqueued: boolean; note?: string }>('/admin/events/sync', { method: 'POST' });
}

export function createEvent(body: {
  name: string;
  startsAt: string;
  hostOrg?: string;
  ownerDensity?: string;
  venue?: string;
}) {
  return request<EventRow>('/admin/events', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function pasteEvents(text: string) {
  return request<{ created: number; errors: string[]; note?: string }>('/admin/events/paste', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function updateEventStatus(id: string, status: string) {
  return request<EventRow & { award?: AwardResult | null }>(
    `/events/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
}


export function pasteEventAttendees(id: string, text: string, role = 'attendee') {
  return request<{ linked: number }>(`/events/${encodeURIComponent(id)}/attendees/paste`, {
    method: 'POST',
    body: JSON.stringify({ text, role }),
  });
}

export function markEventAttendeeMet(eventId: string, personId: string, met = true) {
  return request<{ id: string; metAt: string | null; award?: AwardResult | null }>(
    `/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(personId)}/met`,
    { method: 'POST', body: JSON.stringify({ met }) },
  );
}


export function generateEventBrief(id: string, email = false) {
  return request<{ id: string; htmlBody: string; matchCount: number }>(
    `/events/${encodeURIComponent(id)}/brief`,
    { method: 'POST', body: JSON.stringify({ email }) },
  );
}

export function listAgents(limit = 15) {
  return request<{
    items: Array<{
      name: string;
      address: string | null;
      ownerCount: number;
      parcelCount: number;
      scoreSum: number;
    }>;
  }>(`/agents?limit=${limit}`);
}

export async function downloadInviteList(body: {
  minScore?: number;
  excludeContactedWithinDays?: number;
  ownerType?: 'entity' | 'individual' | 'absentee';
}) {
  const res = await request<{ count: number; csv: string }>('/admin/invite-list', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invite-list-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return res;
}

export function enqueueQuarterlyReport() {
  return request<{ enqueued: boolean; note?: string }>('/admin/reports/quarterly', {
    method: 'POST',
  });
}

export function assignSubmarkets() {
  return request<{ assigned: number; note?: string }>('/admin/submarkets/assign', {
    method: 'POST',
  });
}

export function pasteLiens(text: string) {
  return request<{ parsed: number; signalsCreated: number }>('/admin/liens/paste', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function pasteBrokers(text: string) {
  return request<{ upserted: number; note?: string }>('/admin/brokers/paste', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function getAnalyticsStatus() {
  return request<{
    enabled: boolean;
    hasKey: boolean;
    model: string;
    ready: boolean;
    note: string;
    reason?: string;
    keyPrefix?: string | null;
    diagnostics?: {
      llmEnabledEnv: string | null;
      anthropicKeyLength: number;
      tip?: string;
    };
  }>('/analytics/status');
}

export function askAnalytics(question: string, pin?: string) {
  return request<{
    answer: string;
    suggestedActions: string[];
    citedPins: string[];
    usedLlm: boolean;
    model?: string;
  }>('/analytics/ask', {
    method: 'POST',
    body: JSON.stringify({ question, pin }),
  });
}

export function explainParcelAi(pin: string) {
  return request<{
    pin: string;
    summary: string;
    callAngle: string;
    risks: string[];
  }>(`/analytics/parcels/${encodeURIComponent(pin)}/explain`, { method: 'POST' });
}

export function polishOutreachAi(pin: string, tone?: string) {
  return request<
    OutreachDrafts & {
      usedLlm: boolean;
    }
  >(`/analytics/parcels/${encodeURIComponent(pin)}/polish-outreach`, {
    method: 'POST',
    body: JSON.stringify({ tone }),
  });
}

export function generateMarketNarrative() {
  return request<{
    headline: string;
    narrative: string;
    opportunities: string[];
    watchouts: string[];
  }>('/analytics/market-narrative', { method: 'POST' });
}

export function getSignalSources() {
  return request<Array<{ key: string; cadence: string; tier: number }>>('/admin/signals/sources');
}

export function runSignalSource(key: string) {
  return request<{ enqueued: boolean; jobId: string; note?: string }>(
    `/admin/signals/run/${encodeURIComponent(key)}`,
    { method: 'POST' },
  );
}

export function ingestSignalRecords(
  key: string,
  records: Array<{ sourceRef: string; body: unknown; fetchedAt?: string }>,
) {
  return request<{ upserted: number; count: number; note?: string }>(
    `/admin/signals/ingest/${encodeURIComponent(key)}`,
    {
      method: 'POST',
      body: JSON.stringify({ records }),
    },
  );
}

export function submitManualSignal(body: {
  companyName: string;
  type: string;
  headline: string;
  siteAddress?: string;
  referralSource?: string;
  subtype?: string;
  weight?: number;
}) {
  return request<{ signalId: string; companyId: string }>('/admin/signals/manual', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getSignalMovers(minDelta = 20) {
  return request<
    Array<{
      companyId: string;
      companyName: string;
      score: number;
      previousScore: number | null;
      delta: number;
      bandLabel: string;
      topSignals: Array<{ headline: string; type: string; subtype: string | null }>;
    }>
  >(`/admin/signals/movers?minDelta=${minDelta}`);
}

export function listResolutionQueue(status = 'pending') {
  return request<
    Array<{
      id: string;
      kind: string;
      rawName: string | null;
      rawAddress: string | null;
      candidateScore: number | null;
      status: string;
    }>
  >(`/admin/signals/resolution-queue?status=${encodeURIComponent(status)}`);
}

export function getReferralAttribution(days = 365) {
  return request<{
    days: number;
    totalReferrals: number;
    uniqueSources: number;
    sources: Array<{
      referralSource: string;
      count: number;
      companies: Array<{
        companyId: string;
        companyName: string;
        score: number | null;
        bandLabel: string | null;
        headline: string;
        occurredAt: string;
      }>;
    }>;
  }>(`/admin/signals/referrals?days=${days}`);
}

export function resolveResolutionItem(
  id: string,
  body: { action: 'confirm' | 'reject' | 'create_new'; note?: string },
) {
  return request<{ ok: boolean }>(`/admin/signals/resolution-queue/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type BuildingAttributesPayload = {
  buildingSf?: number | null;
  clearHeightFt?: number | null;
  dockDoors?: number | null;
  driveInDoors?: number | null;
  sprinklerType?: string | null;
  powerAmps?: number | null;
  powerVolts?: number | null;
  railServed?: boolean | null;
  yardAcres?: number | null;
  trailerStalls?: number | null;
  officeSf?: number | null;
  craneCapacityTon?: number | null;
  yearBuilt?: number | null;
  isListed?: boolean | null;
  sourceNotes?: string | null;
  verifiedBy?: string | null;
  markVerified?: boolean;
};

export function getBuildingAttributes(pin: string) {
  return request<{
    pin: string;
    attributes: (BuildingAttributesPayload & {
      verifiedAt?: string | null;
      verifiedBy?: string | null;
    }) | null;
    inferred: { buildingSf: number | null; yearBuilt: number | null };
    display: {
      buildingSf: number | null;
      buildingSfVerified: boolean;
      yearBuilt: number | null;
      yearBuiltVerified: boolean;
      clearHeightFt: number | null;
      clearHeightVerified: boolean;
    };
  }>(`/parcels/${encodeURIComponent(pin)}/building-attributes`);
}

export function saveBuildingAttributes(pin: string, body: BuildingAttributesPayload) {
  return request<{ pin: string; attributes: BuildingAttributesPayload }>(
    `/parcels/${encodeURIComponent(pin)}/building-attributes`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
}

export function getIndustrialCoverage() {
  return request<{
    minSf: number;
    totalEligible: number;
    totalWithVerifiedClear: number;
    pct: number;
    bySubmarket: Array<{
      submarket: string;
      eligible: number;
      withVerifiedClear: number;
      pct: number;
      missingPins: string[];
    }>;
    note: string;
  }>('/industrial/coverage');
}

export function listRequirements(all = false) {
  return request<
    Array<{
      id: string;
      clientName: string;
      minSf: number | null;
      maxSf: number | null;
      minClearHeight: number | null;
      minDockDoors: number | null;
      minYardAcres: number | null;
      railRequired: boolean;
      submarkets: string[];
      notes: string | null;
      isActive: boolean;
    }>
  >(`/requirements${all ? '?all=1' : ''}`);
}

export function createRequirement(body: {
  clientName: string;
  minSf?: number | null;
  maxSf?: number | null;
  minClearHeight?: number | null;
  minDockDoors?: number | null;
  minYardAcres?: number | null;
  railRequired?: boolean;
  submarkets?: string[];
  notes?: string | null;
}) {
  return request<{ id: string }>('/requirements', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getRequirementMatches(id: string) {
  return request<{
    requirement: { id: string; clientName: string };
    matches: Array<{
      pin: string;
      situsAddress: string | null;
      submarket: string | null;
      ownerName: string | null;
      isListed: boolean;
      score: number;
      matchExplanation: string;
      buildingSf: number | null;
      clearHeightFt: number | null;
    }>;
  }>(`/requirements/${encodeURIComponent(id)}/matches`);
}

export function generateIndustrialQuarterlyReport(email = false) {
  return request<{ reportId: string; title: string; verifiedCount: number; coverage: { pct: number } }>(
    '/admin/reports/industrial-quarterly',
    { method: 'POST', body: JSON.stringify({ email }) },
  );
}

export function createYardObservation(body: {
  pin?: string;
  companyName?: string;
  siteAddress?: string;
  flightDate: string;
  trailerCount?: number | null;
  containerCount?: number | null;
  yardCoveragePct: number;
  yardAcres?: number | null;
  imageRef?: string | null;
}) {
  return request<{
    eventKind: string;
    signalUpserted: number;
    annotatedImageRef: string;
    note: string;
  }>('/admin/signals/yard-observations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function verifyToken(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const res = await fetch('/admin/sync-runs?limit=1', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-store',
      },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return false;
    return res.ok || res.status >= 500;
  } catch {
    throw new Error('Could not reach API');
  }
}
