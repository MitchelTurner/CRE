import { clearToken, getToken } from './auth';
import type {
  DigestPreview,
  FeedbackRating,
  HitlReview,
  LeadRow,
  LeadStatus,
  MapPoint,
  OutreachDrafts,
  ParcelDetail,
  ParcelListItem,
  SyncRun,
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
  return (await res.json()) as T;
}

export interface ParcelListQuery {
  minScore?: number;
  landUse?: string;
  absentee?: boolean;
  limit?: number;
  offset?: number;
}

export function listParcels(query: ParcelListQuery = {}) {
  const params = new URLSearchParams();
  if (query.minScore !== undefined) params.set('minScore', String(query.minScore));
  if (query.landUse) params.set('landUse', query.landUse);
  if (query.absentee !== undefined) params.set('absentee', String(query.absentee));
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

export function listLeads(status?: LeadStatus) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<{ items: LeadRow[] }>(`/leads${qs}`);
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

export function submitLeadFeedback(id: string, rating: FeedbackRating, note?: string) {
  return request<LeadRow>(`/leads/${encodeURIComponent(id)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating, note }),
  });
}

export function enqueueSync() {
  return request<{ enqueued: boolean; jobId: string; note?: string }>('/admin/sync', {
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

export function previewDigest() {
  return request<DigestPreview>('/admin/digest/preview', { method: 'POST' });
}

export function sendDigest() {
  return request<{ enqueued: boolean; jobId: string }>('/admin/digest/send', { method: 'POST' });
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
