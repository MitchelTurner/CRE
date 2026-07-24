/**
 * Estate / probate watch — Greenville County probate indexes.
 * Configure PROBATE_INDEX_URL; failures return [].
 */
export interface ProbateHit {
  decedentName?: string;
  pin?: string;
  caseNumber?: string;
  payload: Record<string, unknown>;
}

export interface ProbateClient {
  fetchRecentEstates(since: Date): Promise<ProbateHit[]>;
}

export class StubProbateClient implements ProbateClient {
  async fetchRecentEstates(_since: Date): Promise<ProbateHit[]> {
    return [];
  }
}

export class HttpProbateClient implements ProbateClient {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchRecentEstates(since: Date): Promise<ProbateHit[]> {
    try {
      const res = await this.fetchImpl(this.url, {
        headers: {
          Accept: 'text/html,application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+probate)',
        },
      });
      if (!res.ok) return [];
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
        return (data.results ?? []).slice(0, 200).map((r) => ({
          decedentName: r.name ? String(r.name) : undefined,
          pin: r.pin ? String(r.pin) : undefined,
          caseNumber: r.caseNumber ? String(r.caseNumber) : undefined,
          payload: { ...r, since: since.toISOString() },
        }));
      }
      const text = await res.text();
      // Very loose name extraction from HTML tables — better with a real API.
      const names = [...new Set(text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) ?? [])];
      return names.slice(0, 50).map((name) => ({
        decedentName: name.toUpperCase(),
        payload: { name, sourceUrl: this.url, since: since.toISOString() },
      }));
    } catch {
      return [];
    }
  }
}

export function createProbateClient(env: NodeJS.ProcessEnv = process.env): ProbateClient {
  if (env.PROBATE_SCRAPER_ENABLED === 'false') return new StubProbateClient();
  const url = (env.PROBATE_INDEX_URL || '').trim();
  if (!url) return new StubProbateClient();
  return new HttpProbateClient(url);
}
