/**
 * County Real Property / assessor public page helper.
 * Greenville uses an ASP.NET form UI — we expose a searchable public URL and
 * best-effort GET scrape when a direct Map No page is available. Never invents fields.
 */
export type AssessorLookup = {
  publicUrl: string;
  scraped: boolean;
  ownerName?: string | null;
  situsAddress?: string | null;
  landUse?: string | null;
  fairMarketVal?: number | null;
  totalTax?: number | null;
  rawExcerpt?: string | null;
  source: 'greenville_realproperty' | 'link_only';
};

export interface AssessorClient {
  lookupByPin(pin: string): Promise<AssessorLookup>;
}

export class LinkOnlyAssessorClient implements AssessorClient {
  constructor(private readonly baseUrl: string) {}

  async lookupByPin(pin: string): Promise<AssessorLookup> {
    return {
      publicUrl: buildAssessorUrl(this.baseUrl, pin),
      scraped: false,
      source: 'link_only',
    };
  }
}

/**
 * Attempts a lightweight GET against common RealProperty patterns.
 * Falls back to link-only when HTML is a form postback shell (typical for Greenville).
 */
export class HttpAssessorClient implements AssessorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async lookupByPin(pin: string): Promise<AssessorLookup> {
    const publicUrl = buildAssessorUrl(this.baseUrl, pin);
    const candidates = [
      publicUrl,
      `${trimSlash(this.baseUrl)}/Parcel.aspx?MapNo=${encodeURIComponent(pin)}`,
      `${trimSlash(this.baseUrl)}/Default.aspx?MapNo=${encodeURIComponent(pin)}`,
    ];

    for (const url of candidates) {
      try {
        const res = await this.fetchImpl(url, {
          headers: {
            Accept: 'text/html',
            'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+assessor; contact via API_TOKEN owner)',
          },
          redirect: 'follow',
        });
        if (!res.ok) continue;
        const html = await res.text();
        if (html.length < 80) continue;
        // Form-only shells without a result card are not useful scrapes.
        if (/__doPostBack/i.test(html) && !/Fair\s*Market|Owner\s*Name|Tot(?:al)?\s*Tax/i.test(html)) {
          continue;
        }
        const parsed = parseAssessorHtml(html);
        if (parsed.ownerName || parsed.fairMarketVal != null || parsed.totalTax != null) {
          return {
            publicUrl: url,
            scraped: true,
            ...parsed,
            rawExcerpt: html.replace(/\s+/g, ' ').slice(0, 500),
            source: 'greenville_realproperty',
          };
        }
      } catch {
        /* try next */
      }
    }

    return {
      publicUrl,
      scraped: false,
      source: 'link_only',
    };
  }
}

export function createAssessorClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): AssessorClient {
  const base =
    (env.COUNTY_PARCEL_LINK_BASE || '').trim() ||
    'https://www.greenvillecounty.org/appsas400/RealProperty/';
  if (env.ASSESSOR_SCRAPER_ENABLED === 'false') {
    return new LinkOnlyAssessorClient(base);
  }
  return new HttpAssessorClient(base, fetchImpl);
}

export function buildAssessorUrl(baseUrl: string, pin: string): string {
  const base = trimSlash(baseUrl || 'https://www.greenvillecounty.org/appsas400/RealProperty');
  // Greenville search is form-based; MapNo query is a best-effort deep link.
  return `${base}/Default.aspx?MapNo=${encodeURIComponent(pin)}`;
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

function parseAssessorHtml(html: string): {
  ownerName?: string | null;
  situsAddress?: string | null;
  landUse?: string | null;
  fairMarketVal?: number | null;
  totalTax?: number | null;
} {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const owner =
    text.match(/Owner(?:\s*Name)?\s*[:#]\s*([A-Z0-9][A-Z0-9 &.',/-]{3,80})/i)?.[1]?.trim() ??
    null;
  const landUse =
    text.match(/Land\s*Use\s*[:#]\s*([A-Z0-9][A-Z0-9 /.-]{1,40})/i)?.[1]?.trim() ?? null;
  const fmvRaw =
    text.match(/Fair\s*Market\s*Val(?:ue)?\s*[:#]?\s*\$?([\d,]+)/i)?.[1] ??
    text.match(/FMV\s*[:#]?\s*\$?([\d,]+)/i)?.[1];
  const taxRaw = text.match(/Tot(?:al)?\s*Tax\s*[:#]?\s*\$?([\d,.]+)/i)?.[1];
  const situs =
    text.match(/Location|Situs|Property\s*Address\s*[:#]\s*([0-9].{5,80})/i)?.[1]?.trim() ?? null;
  return {
    ownerName: owner,
    situsAddress: situs,
    landUse,
    fairMarketVal: fmvRaw ? Number(fmvRaw.replace(/,/g, '')) : null,
    totalTax: taxRaw ? Number(taxRaw.replace(/,/g, '')) : null,
  };
}
