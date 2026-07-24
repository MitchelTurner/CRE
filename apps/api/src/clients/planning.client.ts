/**
 * Zoning / land-use change watch — Greenville planning agendas.
 * Best-effort HTML/JSON fetch; configure PLANNING_AGENDA_URL.
 */
export interface PlanningHit {
  pin?: string;
  address?: string;
  title?: string;
  payload: Record<string, unknown>;
}

export interface PlanningClient {
  fetchRecentRezones(): Promise<PlanningHit[]>;
}

export class StubPlanningClient implements PlanningClient {
  async fetchRecentRezones(): Promise<PlanningHit[]> {
    return [];
  }
}

export class HttpPlanningClient implements PlanningClient {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchRecentRezones(): Promise<PlanningHit[]> {
    try {
      const res = await this.fetchImpl(this.url, {
        headers: {
          Accept: 'text/html,application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+planning)',
        },
      });
      if (!res.ok) return [];
      const text = await res.text();
      const pins = [...new Set(text.match(/\b\d{3,5}[A-Z]?\d{6,10}\b/g) ?? [])];
      const addresses =
        text.match(/\b\d{1,5}\s+[A-Z][A-Za-z0-9 .'-]+(?:ST|AVE|RD|DR|BLVD|HWY|LN|CT)\b/gi) ?? [];
      const hits: PlanningHit[] = pins.slice(0, 200).map((pin) => ({
        pin,
        payload: { pin, sourceUrl: this.url, kind: 'zoning_change' },
      }));
      for (const address of addresses.slice(0, 50)) {
        hits.push({
          address: address.toUpperCase(),
          title: 'Planning agenda item',
          payload: { address, sourceUrl: this.url, kind: 'zoning_change' },
        });
      }
      return hits;
    } catch {
      return [];
    }
  }
}

export function createPlanningClient(env: NodeJS.ProcessEnv = process.env): PlanningClient {
  if (env.PLANNING_SCRAPER_ENABLED === 'false') return new StubPlanningClient();
  const url = (env.PLANNING_AGENDA_URL || '').trim();
  if (!url) return new StubPlanningClient();
  return new HttpPlanningClient(url);
}
