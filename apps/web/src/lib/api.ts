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
  OutreachDrafts,
  ParcelDetail,
  ParcelListItem,
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

export function getParcelOutreach(pin: string) {
  return request<OutreachDrafts>(`/parcels/${encodeURIComponent(pin)}/outreach`);
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
  return request(`/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function logLeadOutcome(id: string, outcome: LeadOutcome) {
  return request<LeadRow>(`/leads/${encodeURIComponent(id)}/outcome`, {
    method: 'POST',
    body: JSON.stringify({ outcome }),
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

export function updateEventStatus(id: string, status: string) {
  return request<EventRow>(`/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function pasteEventAttendees(id: string, text: string, role = 'attendee') {
  return request<{ linked: number }>(`/events/${encodeURIComponent(id)}/attendees/paste`, {
    method: 'POST',
    body: JSON.stringify({ text, role }),
  });
}

export function markEventAttendeeMet(eventId: string, personId: string, met = true) {
  return request<{ id: string; metAt: string | null }>(
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
