import { Injectable, Logger } from '@nestjs/common';
import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';

const WAREHOUSE_PROD =
  /warehouse|forklift|material\s*handler|picker|packer|production|assembler|cnc|machine\s*operator|shipping|receiving|yard\s*jockey|dock/i;

export type HiringPostingBody = {
  companyName: string;
  address: string;
  title: string;
  postedAt: string;
  city?: string;
  state?: string;
  source?: string;
};

export type HiringSurgeBody = {
  eventKind: 'surge';
  companyName: string;
  address: string;
  postingCount: number;
  windowDays: number;
  titles?: string[];
  postedFrom?: string;
  postedTo?: string;
};

/**
 * Tier-2 hiring surge from job postings geocoded to a facility address.
 * Opt-in: SIGNAL_HIRING_ENABLED=true + HIRING_FEED_URL, or Admin paste.
 * Emit when ≥8 warehouse/production reqs at one address in 60 days.
 */
@Injectable()
export class HiringConnector implements SignalSource {
  readonly key = 'hiring';
  readonly cadence = '0 15 * * *';
  readonly tier = 2 as const;
  private readonly logger = new Logger(HiringConnector.name);

  async fetch(since: Date): Promise<RawRecord[]> {
    if (process.env.SIGNAL_HIRING_ENABLED !== 'true') {
      this.logger.debug('SIGNAL_HIRING_ENABLED not true — hiring idle');
      return [];
    }
    const feedUrl = (process.env.HIRING_FEED_URL || '').trim();
    if (!feedUrl) {
      this.logger.warn('HIRING_FEED_URL unset — use Admin paste for postings/surges');
      return [];
    }
    const res = await fetch(feedUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+hiring-connector; industrial-signals)',
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HIRING_FEED_URL HTTP ${res.status}`);
    const rows = (await res.json()) as unknown[];
    return this.toRawRecords(rows, since);
  }

  normalize(raw: RawRecord): SignalDraft[] {
    const b = raw.body as HiringSurgeBody | HiringPostingBody;
    if (!b || typeof b !== 'object') return [];

    if ('eventKind' in b && b.eventKind === 'surge') {
      return this.normalizeSurge(b, raw.sourceRef);
    }

    // Single posting — only emit if already aggregated externally as surge-shaped.
    return [];
  }

  /** Shared by fetch + Admin paste (paste can send postings or pre-built surges). */
  toRawRecords(rows: unknown[], since: Date): RawRecord[] {
    if (!rows.length) return [];
    const first = rows[0] as Record<string, unknown>;
    if (first?.eventKind === 'surge' || (first?.postingCount != null && first?.companyName)) {
      return (rows as HiringSurgeBody[])
        .filter((r) => (r.postingCount ?? 0) >= 8)
        .map((body) => ({
          sourceRef: `hiring:surge:${body.companyName}:${body.address}:${body.postedTo || body.postedFrom || ''}`.slice(
            0,
            200,
          ),
          fetchedAt: new Date(),
          body: { ...body, eventKind: 'surge' as const },
        }));
    }

    const postings = (rows as HiringPostingBody[]).filter((p) => {
      if (!p?.companyName || !p.address || !p.title || !p.postedAt) return false;
      if (!WAREHOUSE_PROD.test(p.title)) return false;
      const d = new Date(p.postedAt);
      return !Number.isNaN(d.getTime()) && d.getTime() >= since.getTime();
    });

    const byKey = new Map<string, HiringPostingBody[]>();
    for (const p of postings) {
      const key = `${normalizeAddr(p.address)}::${normalizeName(p.companyName)}`;
      const list = byKey.get(key) ?? [];
      list.push(p);
      byKey.set(key, list);
    }

    const out: RawRecord[] = [];
    const windowMs = 60 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const [, list] of byKey) {
      const recent = list.filter((p) => now - new Date(p.postedAt).getTime() <= windowMs);
      if (recent.length < 8) continue;
      const dates = recent.map((p) => new Date(p.postedAt).getTime()).sort((a, b) => a - b);
      const body: HiringSurgeBody = {
        eventKind: 'surge',
        companyName: recent[0]!.companyName,
        address: recent[0]!.address,
        postingCount: recent.length,
        windowDays: 60,
        titles: [...new Set(recent.map((p) => p.title))].slice(0, 12),
        postedFrom: new Date(dates[0]!).toISOString(),
        postedTo: new Date(dates[dates.length - 1]!).toISOString(),
      };
      out.push({
        sourceRef: `hiring:surge:${body.companyName}:${normalizeAddr(body.address)}:${body.postedTo}`.slice(
          0,
          200,
        ),
        fetchedAt: new Date(),
        body,
      });
    }
    return out;
  }

  private normalizeSurge(b: HiringSurgeBody, sourceRef: string): SignalDraft[] {
    if (!b.companyName || !b.address || (b.postingCount ?? 0) < 8) return [];
    const occurredAt = b.postedTo ? new Date(b.postedTo) : new Date();
    return [
      {
        type: 'HIRING_SURGE',
        subtype: 'warehouse_production',
        companyName: b.companyName,
        companyAddress: b.address,
        siteAddress: b.address,
        occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
        sourceRef,
        headline: `Hiring surge — ${b.companyName} (${b.postingCount} warehouse/production reqs / ${b.windowDays || 60}d)`,
        weight: 25,
        payload: {
          postingCount: b.postingCount,
          windowDays: b.windowDays || 60,
          titles: b.titles ?? [],
          address: b.address,
          detail: `${b.postingCount} reqs in ${b.windowDays || 60}d`,
          internalOnly: true,
        },
      },
    ];
  }
}

function normalizeAddr(a: string): string {
  return a.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 64);
}

function normalizeName(n: string): string {
  return n.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 48);
}
