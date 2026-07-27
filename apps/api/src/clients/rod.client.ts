/**
 * Greenville Register of Deeds (GovOS / Neumo Cloud Search) client.
 *
 * Auth: form POST /signin (HTMX) → authToken cookies
 * Search: WebSocket wss://{host}/ws with @kofile/FETCH_DOCUMENTS/v4
 *
 * Behind ROD_SCRAPER_ENABLED. Requires ROD_EMAIL + ROD_PASSWORD.
 */
import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { cleanEnvSecret, parseEnvFlag } from '../config/env-flags';

export interface RodDeedRecord {
  recordedAt: Date;
  grantor: string;
  grantee: string;
  book?: string;
  page?: string;
  documentType?: string;
  pin?: string;
  instrumentNumber?: string;
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

type RodDoc = Record<string, unknown>;

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function asNameList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? stripHtml(v) : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const t = stripHtml(value);
    return t ? [t] : [];
  }
  return [];
}

function parseRecordedDate(raw: unknown): Date {
  if (raw == null) return new Date();
  const s = String(raw).trim();
  // MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function parseBookPage(bookVolumePage: unknown): { book?: string; page?: string } {
  if (!bookVolumePage) return {};
  const parts = String(bookVolumePage)
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '--');
  if (parts.length === 0) return {};
  if (parts.length === 1) return { book: parts[0] };
  // book/volume/page or book/page
  return {
    book: parts[0],
    page: parts[parts.length - 1],
  };
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function isDeedDoc(doc: RodDoc): boolean {
  const t = String(doc.docType ?? doc.docTypeCode ?? '').toUpperCase();
  if (!t) return true;
  if (t.includes('MORTGAGE') || t.includes('DEED OF TRUST') || t === 'DOT') return false;
  return (
    t.includes('DEED') ||
    t.includes('WARRANTY') ||
    t.includes('QUIT') ||
    t.includes('TITLE') ||
    t.includes('TRANSFER') ||
    t === 'DE' ||
    t === 'WD' ||
    t === 'QCD'
  );
}

function isMortgageDoc(doc: RodDoc): boolean {
  const t = String(doc.docType ?? doc.docTypeCode ?? '').toUpperCase();
  return t.includes('MORTGAGE') || t.includes('DEED OF TRUST') || t === 'MTG' || t === 'DOT';
}

function extractPin(doc: RodDoc): string | undefined {
  for (const key of ['pin', 'parcelId', 'parcelID', 'taxMapNumber', 'tms', 'parcelNumber']) {
    const v = doc[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  }
  return undefined;
}

/**
 * Best-effort GovOS / Neumo client using real Cloud Search login + WebSocket search.
 */
export class GovOsRodClient implements RodClient {
  private session:
    | {
        cookieHeader: string;
        authToken: string;
      }
    | null = null;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private lastRequestAt = 0;
  private department: string;

  constructor(
    private readonly options: {
      baseUrl: string;
      email: string;
      password: string;
      department?: string;
      minDelayMs?: number;
      maxResults?: number;
      fetchImpl?: typeof fetch;
      logger?: (msg: string) => void;
      WebSocketImpl?: typeof WebSocket;
    },
  ) {
    this.department = (options.department || 'RP').trim() || 'RP';
  }

  private get fetchImpl() {
    return this.options.fetchImpl ?? fetch;
  }

  private get WsImpl() {
    return this.options.WebSocketImpl ?? WebSocket;
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

  private parseSetCookies(res: Response): string[] {
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    if (typeof headers.getSetCookie === 'function') {
      return headers.getSetCookie();
    }
    const single = res.headers.get('set-cookie');
    return single ? [single] : [];
  }

  private mergeCookies(existing: string, setCookies: string[]): string {
    const map = new Map<string, string>();
    for (const part of existing.split(';').map((s) => s.trim()).filter(Boolean)) {
      const i = part.indexOf('=');
      if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
    }
    for (const raw of setCookies) {
      const first = raw.split(';')[0] ?? '';
      const i = first.indexOf('=');
      if (i > 0) map.set(first.slice(0, i), first.slice(i + 1));
    }
    return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private authTokenFromCookie(cookieHeader: string): string | null {
    const m = cookieHeader.match(/(?:^|;\s*)authToken=([^;]+)/);
    return m?.[1] ?? null;
  }

  /** Public probe for Admin — verifies Cloud Search login without searching. */
  async probeLogin(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.ensureSession();
      return { ok: true, detail: `Signed in to ${this.options.baseUrl} (department ${this.department}).` };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async ensureSession(): Promise<{ cookieHeader: string; authToken: string }> {
    if (this.session) return this.session;
    if (!this.options.email || !this.options.password) {
      throw new Error('ROD credentials missing');
    }

    await this.throttle();
    const signinUrl = `${this.options.baseUrl}/signin`;
    const boot = await this.fetchImpl(signinUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+rod-client)',
      },
      redirect: 'manual',
    });
    let cookieHeader = this.mergeCookies('', this.parseSetCookies(boot));

    await this.throttle();
    const body = new URLSearchParams({
      email: this.options.email,
      password: this.options.password,
    });
    const loginRes = await this.fetchImpl(signinUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+rod-client)',
        'HX-Request': 'true',
        Origin: this.options.baseUrl,
        Referer: signinUrl,
        Cookie: cookieHeader,
      },
      body: body.toString(),
      redirect: 'manual',
    });
    cookieHeader = this.mergeCookies(cookieHeader, this.parseSetCookies(loginRes));
    const loginHtml = await loginRes.text();

    if (loginRes.status === 401 || /Invalid credentials/i.test(loginHtml)) {
      throw new Error(
        'ROD login failed: invalid email/password for greenville.sc.publicsearch.us — check Railway ROD_EMAIL / ROD_PASSWORD',
      );
    }
    if (!loginRes.ok && loginRes.status !== 302 && loginRes.status !== 303) {
      throw new Error(`ROD login HTTP ${loginRes.status}`);
    }

    const authToken = this.authTokenFromCookie(cookieHeader);
    if (!authToken) {
      throw new Error('ROD login did not return authToken cookie');
    }

    // Prefer department from env; otherwise try to read county config after login.
    await this.discoverDepartment(cookieHeader).catch(() => undefined);

    this.session = { cookieHeader, authToken };
    this.log(`ROD session established (dept=${this.department})`);
    return this.session;
  }

  private async discoverDepartment(cookieHeader: string): Promise<void> {
    if (this.options.department) return;
    for (const path of ['/search/advanced', '/results?department=RP']) {
      await this.throttle();
      const res = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        headers: {
          Accept: 'text/html',
          Cookie: cookieHeader,
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+rod-client)',
        },
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const html = await res.text();
      const m = html.match(/window\.__data=(\{[\s\S]*?\})\s*;?\s*<\/script>/);
      const rawData = m?.[1];
      if (!rawData) continue;
      try {
        const data = JSON.parse(rawData.replace(/\bundefined\b/g, 'null')) as {
          configuration?: { departments?: Array<{ code?: string; name?: string; partyFields?: string[] }> };
        };
        const deps = data.configuration?.departments ?? [];
        const withParties = deps.find((d) =>
          (d.partyFields ?? []).some((f) => /grantor|grantee/i.test(f)),
        );
        const rp = deps.find((d) => d.code === 'RP');
        const chosen = withParties?.code || rp?.code || deps[0]?.code;
        if (chosen) {
          this.department = chosen;
          this.log(`ROD department discovered: ${chosen}`);
          return;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  private async wsRequest<T = unknown>(
    session: { cookieHeader: string; authToken: string },
    message: Record<string, unknown>,
    timeoutMs = 30000,
  ): Promise<T> {
    const wsUrl = this.options.baseUrl.replace(/^http/, 'ws') + '/ws';
    const Ws = this.WsImpl;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const ws = new Ws(wsUrl, {
        headers: {
          Cookie: session.cookieHeader,
          Origin: this.options.baseUrl,
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+rod-client)',
        },
      });
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          reject(new Error('ROD WebSocket search timed out'));
        }
      }, timeoutMs);

      const finish = (err?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        if (err) reject(err);
        else resolve(value as T);
      };

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'PING',
            correlationId: randomUUID(),
            authToken: session.authToken,
            sync: true,
          }),
        );
      });

      ws.on('message', (data) => {
        let msg: { type?: string; payload?: unknown; correlationId?: string };
        try {
          msg = JSON.parse(data.toString()) as typeof msg;
        } catch {
          return;
        }
        if (msg.type === 'PONG') {
          ws.send(
            JSON.stringify({
              ...message,
              authToken: session.authToken,
              correlationId: randomUUID(),
              sync: true,
            }),
          );
          return;
        }
        if (msg.type === '@kofile/FETCH_DOCUMENTS_FULFILLED/v6') {
          finish(undefined, msg.payload as T);
          return;
        }
        if (
          msg.type === '@kofile/FETCH_DOCUMENTS_REJECTED/v1' ||
          msg.type === '@kofile/API_ERROR/v0'
        ) {
          const payload = msg.payload as { errors?: unknown } | undefined;
          finish(
            new Error(
              `ROD search rejected: ${typeof payload?.errors === 'string' ? payload.errors : JSON.stringify(payload?.errors ?? msg.type)}`,
            ),
          );
          return;
        }
      });

      ws.on('error', (err) => finish(err instanceof Error ? err : new Error(String(err))));
      ws.on('close', () => {
        if (!settled) finish(new Error('ROD WebSocket closed before search completed'));
      });
    });
  }

  private docsFromPayload(payload: unknown): RodDoc[] {
    const data = (payload as { data?: { byHash?: Record<string, RodDoc>; byOrder?: Array<string | number> } })
      ?.data;
    if (!data?.byHash) return [];
    if (Array.isArray(data.byOrder) && data.byOrder.length > 0) {
      return data.byOrder
        .map((id) => data.byHash![String(id)] ?? data.byHash![id as keyof typeof data.byHash])
        .filter(Boolean) as RodDoc[];
    }
    return Object.values(data.byHash);
  }

  private toDeed(doc: RodDoc): RodDeedRecord {
    const grantors = asNameList(doc.grantor);
    const grantees = asNameList(doc.grantee);
    const { book, page } = parseBookPage(doc.bookVolumePage);
    return {
      recordedAt: parseRecordedDate(doc.recordedDate ?? doc.instrumentDate),
      grantor: grantors.join('; '),
      grantee: grantees.join('; '),
      book,
      page,
      documentType: doc.docType ? String(doc.docType) : undefined,
      pin: extractPin(doc),
      instrumentNumber: doc.instrumentNumber
        ? String(doc.instrumentNumber)
        : doc.docNumber
          ? String(doc.docNumber)
          : undefined,
    };
  }

  async searchRecentDeeds(since: Date): Promise<RodDeedRecord[]> {
    const cacheKey = `deeds:${since.toISOString().slice(0, 10)}`;
    const cached = this.getCached<RodDeedRecord[]>(cacheKey);
    if (cached) return cached;

    const session = await this.ensureSession();
    const max = this.options.maxResults ?? 40;
    const payload = await this.wsRequest<{ data?: unknown }>(session, {
      type: '@kofile/FETCH_DOCUMENTS/v4',
      payload: {
        workspaceID: randomUUID(),
        query: {
          department: this.department,
          searchType: 'advancedSearch',
          keywordSearch: 'false',
          searchOcrText: 'false',
          recordedDateRange: `${yyyymmdd(since)},${yyyymmdd(new Date())}`,
          limit: max,
          offset: 0,
        },
      },
    });

    const docs = this.docsFromPayload(payload).filter(isDeedDoc);
    const records = docs.map((d) => this.toDeed(d)).filter((r) => r.grantor || r.grantee);
    this.log(`ROD deed search returned ${records.length} deed-like docs (dept=${this.department})`);
    this.setCached(cacheKey, records);
    return records;
  }

  async findLatestMortgage(
    ownerName: string,
    pin?: string,
  ): Promise<RodMortgageRecord | null> {
    const cacheKey = `mtg:${ownerName}:${pin ?? ''}`;
    const cached = this.getCached<RodMortgageRecord | null>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const session = await this.ensureSession();
      const since = new Date(Date.now() - 20 * 365 * 24 * 60 * 60 * 1000);
      const payload = await this.wsRequest(session, {
        type: '@kofile/FETCH_DOCUMENTS/v4',
        payload: {
          workspaceID: randomUUID(),
          query: {
            department: this.department,
            searchType: 'quickSearch',
            searchValue: ownerName,
            keywordSearch: 'false',
            searchOcrText: 'false',
            recordedDateRange: `${yyyymmdd(since)},${yyyymmdd(new Date())}`,
            limit: 15,
            offset: 0,
          },
        },
      });
      const docs = this.docsFromPayload(payload).filter(isMortgageDoc);
      const first = docs[0];
      if (!first) {
        this.setCached(cacheKey, null);
        return null;
      }
      const { book, page } = parseBookPage(first.bookVolumePage);
      const record: RodMortgageRecord = {
        originationDate: parseRecordedDate(first.recordedDate ?? first.instrumentDate),
        mortgagor: asNameList(first.grantor).join('; ') || ownerName,
        mortgagee: asNameList(first.grantee).join('; '),
        pin: extractPin(first) ?? pin,
        book,
        page,
      };
      this.setCached(cacheKey, record);
      return record;
    } catch (err) {
      this.log(`ROD mortgage search error: ${err instanceof Error ? err.message : String(err)}`);
      this.setCached(cacheKey, null, 60 * 60 * 1000);
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
    reason: 'ROD scraper enabled with credentials — watcher will login + WebSocket search Cloud Search.',
  };
}

export function createRodClient(env: NodeJS.ProcessEnv = process.env): RodClient {
  const status = getRodClientStatus(env);
  if (!status.ready) return new DisabledRodClient();
  return new GovOsRodClient({
    baseUrl: (env.ROD_BASE_URL || 'https://greenville.sc.publicsearch.us').replace(/\/$/, ''),
    email: cleanEnvSecret(env.ROD_EMAIL || env.ROD_USERNAME),
    password: cleanEnvSecret(env.ROD_PASSWORD),
    department: cleanEnvSecret(env.ROD_DEPARTMENT) || undefined,
    minDelayMs: Number(env.ROD_MIN_DELAY_MS || 750),
    maxResults: Number(env.ROD_MAX_RESULTS || 40),
    logger: (msg) => {
      // Nest logger is attached later via enrichment service when needed.
      if (process.env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.log(`[rod] ${msg}`);
      }
    },
  });
}
