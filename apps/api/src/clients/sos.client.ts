/**
 * SC Secretary of State business entity resolution.
 *
 * Primary: OpenSosData API when SOS_API_KEY / OPENSOSDATA_API_KEY is set
 * (official portal is captcha-gated for anonymous POST search).
 * Fallback: returns null and logs — manual/profile URL still useful in UI.
 */
export interface SosEntityResult {
  legalName: string;
  entityId?: string;
  status?: string;
  entityType?: string;
  registeredAgent?: string;
  agentAddress?: string;
  principalAddress?: string;
  formedAt?: string;
  members?: string[];
  raw?: unknown;
  source: 'opensosdata' | 'manual' | 'fixture';
}

export interface SosClient {
  resolveEntity(name: string): Promise<SosEntityResult | null>;
}

export class StubSosClient implements SosClient {
  async resolveEntity(_name: string): Promise<SosEntityResult | null> {
    return null;
  }
}

export class OpenSosDataClient implements SosClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.opensosdata.com/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async resolveEntity(name: string): Promise<SosEntityResult | null> {
    const cleaned = name.trim();
    if (!cleaned) return null;

    const res = await this.fetchImpl(`${this.baseUrl}/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        Accept: 'application/json',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0',
      },
      body: JSON.stringify({ entity_name: cleaned, state: 'SC' }),
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`OpenSosData HTTP ${res.status}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const legalName = String(data.entity_name ?? data.legal_name ?? data.name ?? cleaned);
    return {
      legalName,
      entityId: data.entity_id ? String(data.entity_id) : undefined,
      status: data.status ? String(data.status) : undefined,
      entityType: data.entity_type ? String(data.entity_type) : undefined,
      registeredAgent: data.registered_agent
        ? String(data.registered_agent)
        : data.agent_name
          ? String(data.agent_name)
          : undefined,
      agentAddress: data.agent_address
        ? String(data.agent_address)
        : data.registered_agent_address
          ? String(data.registered_agent_address)
          : undefined,
      principalAddress: data.principal_address ? String(data.principal_address) : undefined,
      formedAt: data.formation_date ? String(data.formation_date) : undefined,
      raw: data,
      source: 'opensosdata',
    };
  }
}

export function isDissolvedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return /dissolv|forfeit|inactive|revoked|cancelled|canceled/i.test(status);
}

export function createSosClient(env: NodeJS.ProcessEnv = process.env): SosClient {
  const key = (env.SOS_API_KEY || env.OPENSOSDATA_API_KEY || '').trim();
  if (!key) return new StubSosClient();
  return new OpenSosDataClient(key, env.SOS_API_BASE_URL || 'https://api.opensosdata.com/v1');
}
