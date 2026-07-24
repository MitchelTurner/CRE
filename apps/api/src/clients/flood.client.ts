/**
 * FEMA flood zone proxy. Optional FLOOD_API_URL that accepts lat/lon.
 * Without a key, flood signals are skipped (no fake zones).
 */
export interface FloodHit {
  floodZone: string;
  payload: Record<string, unknown>;
}

export interface FloodClient {
  lookupZone(lat: number, lon: number): Promise<FloodHit | null>;
}

export class StubFloodClient implements FloodClient {
  async lookupZone(_lat: number, _lon: number): Promise<FloodHit | null> {
    return null;
  }
}

export class HttpFloodClient implements FloodClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async lookupZone(lat: number, lon: number): Promise<FloodHit | null> {
    try {
      const url = new URL(this.apiUrl);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+flood)',
      };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
      const res = await this.fetchImpl(url.toString(), { headers });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, unknown>;
      const zone = String(data.floodZone ?? data.zone ?? data.FLD_ZONE ?? '');
      if (!zone) return null;
      return { floodZone: zone, payload: data };
    } catch {
      return null;
    }
  }
}

export function createFloodClient(env: NodeJS.ProcessEnv = process.env): FloodClient {
  const url = (env.FLOOD_API_URL || '').trim();
  if (!url) return new StubFloodClient();
  return new HttpFloodClient(url, (env.FLOOD_API_KEY || '').trim() || undefined);
}

export function isHighRiskFloodZone(zone: string | null | undefined): boolean {
  if (!zone) return false;
  return /^(A|AE|AH|AO|V|VE)/i.test(zone.trim());
}
