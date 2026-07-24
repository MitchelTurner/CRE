/**
 * Skip tracing — budget-capped, digest/top-lead only.
 * Configure SKIPTRACE_API_URL + SKIPTRACE_API_KEY for an HTTP provider.
 */
export interface SkipTraceResult {
  name?: string;
  phone?: string;
  email?: string;
  raw?: unknown;
}

export interface SkipTraceClient {
  lookup(input: {
    name: string;
    mailingAddress?: string | null;
  }): Promise<SkipTraceResult | null>;
}

export class StubSkipTraceClient implements SkipTraceClient {
  async lookup(_input: {
    name: string;
    mailingAddress?: string | null;
  }): Promise<SkipTraceResult | null> {
    return null;
  }
}

export class HttpSkipTraceClient implements SkipTraceClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async lookup(input: {
    name: string;
    mailingAddress?: string | null;
  }): Promise<SkipTraceResult | null> {
    const res = await this.fetchImpl(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0',
      },
      body: JSON.stringify({
        name: input.name,
        address: input.mailingAddress ?? undefined,
      }),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`SkipTrace HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    return {
      name: data.name ? String(data.name) : input.name,
      phone: data.phone ? String(data.phone) : undefined,
      email: data.email ? String(data.email) : undefined,
      raw: data,
    };
  }
}

export function createSkipTraceClient(env: NodeJS.ProcessEnv = process.env): SkipTraceClient {
  const url = (env.SKIPTRACE_API_URL || '').trim();
  const key = (env.SKIPTRACE_API_KEY || '').trim();
  if (!url || !key) return new StubSkipTraceClient();
  return new HttpSkipTraceClient(url, key);
}
