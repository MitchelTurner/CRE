/**
 * Greenville Register of Deeds (GovOS Cloud Search) client.
 *
 * Behind ROD_SCRAPER_ENABLED. Requires ROD_EMAIL + ROD_PASSWORD when enabled.
 * Platform is login-walled; implementation is deliberately conservative with
 * caching and rate limits. Swap internals if GovOS endpoints change.
 */
import { cleanEnvSecret, parseEnvFlag } from '../config/env-flags';
export interface RodDeedRecord {
  recordedAt: Date;
  grantor: string;
  grantee: string;
  book?: string;
  page?: string;
  documentType?: string;
  pin?: string;
}

export interface RodMortgageRecord {
  originationDate: Date;
  mortgagor: string;
  mortgagee: string;
  pin?: string;
  amount?: number;
  book?: string;
  page?: string;
}

export interface RodClient {
  searchRecentDeeds(since: Date): Promise<RodDeedRecord[]>;
  findLatestMortgage(ownerName: string, pin?: string): Promise<RodMortgageRecord | null>;
}

export class DisabledRodClient implements RodClient {
  async searchRecentDeeds(_since: Date): Promise<RodDeedRecord[]> {
    return [];
  }

  async findLatestMortgage(
    _ownerName: string,
    _pin?: string,
  ): Promise<RodMortgageRecord | null> {
    return null;
  }
}

type CacheEntry<T> = { expiresAt: number; value: T };

/**
 * Best-effort GovOS client. When credentials are missing or login fails,
 * methods return empty results rather than throwing (jobs stay healthy).
 */
export class GovOsRodClient implements RodClient {
  private sessionCookie: string | null = null;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private lastRequestAt = 0;

  constructor(
    private readonly options: {
      baseUrl: string;
      email: string;
      password: string;
      minDelayMs?: number;
      fetchImpl?: typeof fetch;
      logger?: (msg: string) => void;
    },
  ) {}

  private get fetchImpl() {
    return this.options.fetchImpl ?? fetch;
  }

  private log(msg: string) {
    this.options.logger?.(msg);
  }

  private async throttle(): Promise<void> {
    const delay = this.options.minDelayMs ?? 750;
    const wait = this.lastRequestAt + delay - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private getCached<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  private setCached<T>(key: string, value: T, ttlMs = 6 * 60 * 60 * 1000): void {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  private async ensureSession(): Promise<boolean> {
    if (this.sessionCookie) return true;
    if (!this.options.email || !this.options.password) {
      this.log('ROD credentials missing — scraper idle');
      return false;
    }

    try {
      await this.throttle();
      // GovOS login surface varies; attempt common JSON login then form login.
      const loginUrls = [
        `${this.options.baseUrl}/api/auth/login`,
        `${this.options.baseUrl}/api/login`,
        `${this.options.baseUrl}/login`,
      ];

      for (const url of loginUrls) {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+rod-client)',
          },
          body: JSON.stringify({
            email: this.options.email,
            password: this.options.password,
            username: this.options.email,
          }),
        });
        const setCookie = res.headers.get('set-cookie');
        if (res.ok && setCookie) {
          this.sessionCookie = setCookie.split(';')[0] ?? null;
          this.log(`ROD session established via ${url}`);
          return true;
        }
      }
      this.log('ROD login failed on all endpoints — leaving disabled for this run');
      return false;
    } catch (err) {
      this.log(`ROD login error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async searchRecentDeeds(since: Date): Promise<RodDeedRecord[]> {
    const cacheKey = `deeds:${since.toISOString().slice(0, 10)}`;
    const cached = this.getCached<RodDeedRecord[]>(cacheKey);
    if (cached) return cached;

    const ok = await this.ensureSession();
    if (!ok) return [];

    try {
      await this.throttle();
      const res = await this.fetchImpl(`${this.options.baseUrl}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Cookie: this.sessionCookie ?? '',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+rod-client)',
        },
        body: JSON.stringify({
          docType: 'Deed',
          recordedFrom: since.toISOString().slice(0, 10),
          recordedTo: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) {
        this.log(`ROD deed search HTTP ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
      const records: RodDeedRecord[] = (data.results ?? []).map((r) => ({
        recordedAt: new Date(String(r.recordedAt ?? r.recorded_date ?? Date.now())),
        grantor: String(r.grantor ?? r.Grantor ?? ''),
        grantee: String(r.grantee ?? r.Grantee ?? ''),
        book: r.book ? String(r.book) : undefined,
        page: r.page ? String(r.page) : undefined,
        documentType: r.docType ? String(r.docType) : 'Deed',
        pin: r.pin ? String(r.pin) : undefined,
      }));
      this.setCached(cacheKey, records);
      return records;
    } catch (err) {
      this.log(`ROD deed search error: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async findLatestMortgage(
    ownerName: string,
    pin?: string,
  ): Promise<RodMortgageRecord | null> {
    const cacheKey = `mtg:${ownerName}:${pin ?? ''}`;
    const cached = this.getCached<RodMortgageRecord | null>(cacheKey);
    if (cached !== undefined) return cached;

    const ok = await this.ensureSession();
    if (!ok) return null;

    try {
      await this.throttle();
      const res = await this.fetchImpl(`${this.options.baseUrl}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Cookie: this.sessionCookie ?? '',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+rod-client)',
        },
        body: JSON.stringify({
          docType: 'Mortgage',
          partyName: ownerName,
          pin,
        }),
      });
      if (!res.ok) {
        this.log(`ROD mortgage search HTTP ${res.status}`);
        this.setCached(cacheKey, null, 60 * 60 * 1000);
        return null;
      }
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
      const first = data.results?.[0];
      if (!first) {
        this.setCached(cacheKey, null);
        return null;
      }
      const record: RodMortgageRecord = {
        originationDate: new Date(String(first.recordedAt ?? first.recorded_date ?? Date.now())),
        mortgagor: String(first.mortgagor ?? first.grantor ?? ownerName),
        mortgagee: String(first.mortgagee ?? first.grantee ?? ''),
        pin: first.pin ? String(first.pin) : pin,
        amount: first.amount != null ? Number(first.amount) : undefined,
        book: first.book ? String(first.book) : undefined,
        page: first.page ? String(first.page) : undefined,
      };
      this.setCached(cacheKey, record);
      return record;
    } catch (err) {
      this.log(`ROD mortgage search error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

export type RodClientStatus = {
  ready: boolean;
  enabled: boolean;
  credentialsPresent: boolean;
  reason: string;
};

/** Inspect Railway/env readiness without revealing secrets. */
export function getRodClientStatus(env: NodeJS.ProcessEnv = process.env): RodClientStatus {
  const enabled = parseEnvFlag(env.ROD_SCRAPER_ENABLED) === true;
  const email = cleanEnvSecret(env.ROD_EMAIL || env.ROD_USERNAME);
  const password = cleanEnvSecret(env.ROD_PASSWORD);
  const credentialsPresent = Boolean(email && password);

  if (!enabled) {
    return {
      ready: false,
      enabled: false,
      credentialsPresent,
      reason:
        'ROD_SCRAPER_ENABLED is not true in Railway. Set ROD_SCRAPER_ENABLED=true and redeploy.',
    };
  }
  if (!credentialsPresent) {
    return {
      ready: false,
      enabled: true,
      credentialsPresent: false,
      reason:
        'ROD_EMAIL / ROD_PASSWORD missing in Railway. Add the GovOS Cloud Search login and redeploy.',
    };
  }
  return {
    ready: true,
    enabled: true,
    credentialsPresent: true,
    reason: 'ROD scraper enabled with credentials — watcher will attempt Cloud Search login.',
  };
}

export function createRodClient(env: NodeJS.ProcessEnv = process.env): RodClient {
  const status = getRodClientStatus(env);
  if (!status.ready) return new DisabledRodClient();
  return new GovOsRodClient({
    baseUrl: (env.ROD_BASE_URL || 'https://greenville.sc.publicsearch.us').replace(/\/$/, ''),
    email: cleanEnvSecret(env.ROD_EMAIL || env.ROD_USERNAME),
    password: cleanEnvSecret(env.ROD_PASSWORD),
    minDelayMs: Number(env.ROD_MIN_DELAY_MS || 750),
  });
}
