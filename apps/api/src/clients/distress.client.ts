/**
 * Distress signals: tax delinquency (from parcel fields), tax sale list,
 * Master in Equity foreclosure roster.
 */
export interface DistressHit {
  type: 'tax_delinquent' | 'tax_sale' | 'foreclosure';
  pin?: string;
  ownerName?: string;
  payload: Record<string, unknown>;
  source: string;
}

export interface DistressClient {
  fetchTaxSaleList(): Promise<DistressHit[]>;
  fetchForeclosureRoster(): Promise<DistressHit[]>;
}

export class StubDistressClient implements DistressClient {
  async fetchTaxSaleList(): Promise<DistressHit[]> {
    return [];
  }
  async fetchForeclosureRoster(): Promise<DistressHit[]> {
    return [];
  }
}

/**
 * Best-effort HTML/JSON fetchers. Sites change often — failures return [].
 */
export class HttpDistressClient implements DistressClient {
  constructor(
    private readonly options: {
      taxSaleUrl?: string;
      foreclosureUrl?: string;
      fetchImpl?: typeof fetch;
      logger?: (msg: string) => void;
    } = {},
  ) {}

  private get fetchImpl() {
    return this.options.fetchImpl ?? fetch;
  }

  private log(msg: string) {
    this.options.logger?.(msg);
  }

  async fetchTaxSaleList(): Promise<DistressHit[]> {
    const url = this.options.taxSaleUrl;
    if (!url) return [];
    try {
      const res = await this.fetchImpl(url, {
        headers: {
          Accept: 'text/html,application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+distress)',
        },
      });
      if (!res.ok) {
        this.log(`Tax sale fetch HTTP ${res.status}`);
        return [];
      }
      const text = await res.text();
      // Extract PIN-like tokens (Greenville PINs are often 13-char alphanumerics).
      const pins = [...new Set(text.match(/\b\d{3,5}[A-Z]?\d{6,10}\b/g) ?? [])];
      return pins.slice(0, 500).map((pin) => ({
        type: 'tax_sale' as const,
        pin,
        payload: { pin, sourceUrl: url },
        source: 'tax_sale_list',
      }));
    } catch (err) {
      this.log(`Tax sale fetch error: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async fetchForeclosureRoster(): Promise<DistressHit[]> {
    const url =
      this.options.foreclosureUrl ?? 'https://mie.greenvillejournal.com/';
    try {
      const res = await this.fetchImpl(url, {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+distress)',
        },
      });
      if (!res.ok) {
        this.log(`Foreclosure roster HTTP ${res.status}`);
        return [];
      }
      const text = await res.text();
      const pins = [...new Set(text.match(/\b\d{3,5}[A-Z]?\d{6,10}\b/g) ?? [])];
      return pins.slice(0, 500).map((pin) => ({
        type: 'foreclosure' as const,
        pin,
        payload: { pin, sourceUrl: url },
        source: 'mie_roster',
      }));
    } catch (err) {
      this.log(
        `Foreclosure roster error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }
}

export function createDistressClient(env: NodeJS.ProcessEnv = process.env): DistressClient {
  if (env.DISTRESS_SCRAPER_ENABLED === 'false') return new StubDistressClient();
  return new HttpDistressClient({
    taxSaleUrl: env.TAX_SALE_URL || undefined,
    foreclosureUrl: env.FORECLOSURE_ROSTER_URL || 'https://mie.greenvillejournal.com/',
  });
}
