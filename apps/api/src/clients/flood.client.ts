/**
 * FEMA flood zone lookup.
 * Prefer FLOOD_API_URL proxy when set; otherwise query public FEMA NFHL MapServer layer 28.
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

/** Public FEMA National Flood Hazard Layer — Flood Hazard Zones. */
export class FemaNfhlFloodClient implements FloodClient {
  constructor(
    private readonly layerUrl = 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async lookupZone(lat: number, lon: number): Promise<FloodHit | null> {
    try {
      const qs = new URLSearchParams({
        where: '1=1',
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF',
        returnGeometry: 'false',
        f: 'json',
      });
      const res = await this.fetchImpl(`${this.layerUrl}/query?${qs}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+fema-nfhl)',
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        features?: Array<{ attributes?: Record<string, unknown> }>;
      };
      const attrs = data.features?.[0]?.attributes;
      if (!attrs) return null;
      const zone = String(attrs.FLD_ZONE ?? '').trim();
      if (!zone) return null;
      return {
        floodZone: zone,
        payload: {
          source: 'fema_nfhl',
          FLD_ZONE: zone,
          ZONE_SUBTY: attrs.ZONE_SUBTY ?? null,
          SFHA_TF: attrs.SFHA_TF ?? null,
        },
      };
    } catch {
      return null;
    }
  }
}

export function createFloodClient(env: NodeJS.ProcessEnv = process.env): FloodClient {
  if (env.FLOOD_SCRAPER_ENABLED === 'false') return new StubFloodClient();
  const url = (env.FLOOD_API_URL || '').trim();
  if (url) return new HttpFloodClient(url, (env.FLOOD_API_KEY || '').trim() || undefined);
  // Default: public FEMA NFHL (no key).
  return new FemaNfhlFloodClient();
}

export function isHighRiskFloodZone(zone: string | null | undefined): boolean {
  if (!zone) return false;
  return /^(A|AE|AH|AO|V|VE)/i.test(zone.trim());
}
