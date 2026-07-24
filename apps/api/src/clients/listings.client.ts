/**
 * Nearby listing / sale comps bleed.
 * Configure LISTINGS_API_URL for a JSON feed; optional manual paste via admin later.
 */
export interface ListingHit {
  pin?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
  price?: number;
  payload: Record<string, unknown>;
}

export interface ListingsClient {
  fetchActiveListings(): Promise<ListingHit[]>;
}

export class StubListingsClient implements ListingsClient {
  async fetchActiveListings(): Promise<ListingHit[]> {
    return [];
  }
}

export class HttpListingsClient implements ListingsClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchActiveListings(): Promise<ListingHit[]> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+listings)',
      };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
      const res = await this.fetchImpl(this.apiUrl, { headers });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const rows = Array.isArray(data) ? data : (data.results ?? []);
      return rows.slice(0, 500).map((r) => ({
        pin: r.pin ? String(r.pin) : undefined,
        address: r.address ? String(r.address) : undefined,
        latitude: r.latitude != null ? Number(r.latitude) : undefined,
        longitude: r.longitude != null ? Number(r.longitude) : undefined,
        status: r.status ? String(r.status) : 'for_sale',
        price: r.price != null ? Number(r.price) : undefined,
        payload: r,
      }));
    } catch {
      return [];
    }
  }
}

export function createListingsClient(env: NodeJS.ProcessEnv = process.env): ListingsClient {
  const url = (env.LISTINGS_API_URL || '').trim();
  if (!url) return new StubListingsClient();
  return new HttpListingsClient(url, (env.LISTINGS_API_KEY || '').trim() || undefined);
}
