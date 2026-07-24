/**
 * Commercial building permit activity.
 * Configure PERMITS_API_URL (JSON list) or leave stubbed.
 */
export interface PermitHit {
  pin?: string;
  address?: string;
  permitType?: string;
  issuedAt?: string;
  payload: Record<string, unknown>;
}

export interface PermitsClient {
  fetchRecentCommercialPermits(since: Date): Promise<PermitHit[]>;
}

export class StubPermitsClient implements PermitsClient {
  async fetchRecentCommercialPermits(_since: Date): Promise<PermitHit[]> {
    return [];
  }
}

export class HttpPermitsClient implements PermitsClient {
  constructor(
    private readonly apiUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchRecentCommercialPermits(since: Date): Promise<PermitHit[]> {
    try {
      const url = new URL(this.apiUrl);
      url.searchParams.set('since', since.toISOString().slice(0, 10));
      url.searchParams.set('commercial', 'true');
      const res = await this.fetchImpl(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+permits)',
        },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const rows = Array.isArray(data) ? data : (data.results ?? []);
      return rows.slice(0, 500).map((r) => ({
        pin: r.pin ? String(r.pin) : undefined,
        address: r.address ? String(r.address) : undefined,
        permitType: r.permitType ? String(r.permitType) : undefined,
        issuedAt: r.issuedAt ? String(r.issuedAt) : undefined,
        payload: r,
      }));
    } catch {
      return [];
    }
  }
}

export function createPermitsClient(env: NodeJS.ProcessEnv = process.env): PermitsClient {
  const url = (env.PERMITS_API_URL || '').trim();
  if (!url) return new StubPermitsClient();
  return new HttpPermitsClient(url);
}
