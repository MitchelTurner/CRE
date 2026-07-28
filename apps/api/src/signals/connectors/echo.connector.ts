import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';

const ECHO_BASE = 'https://echodata.epa.gov/echo';

/** Greenville–Spartanburg–Anderson CSA FIPS (SC). */
const DEFAULT_FIPS = '45045,45083,45007,45059,45077';

export type EchoEventBody = {
  eventKind:
    | 'air_fce'
    | 'rcra_change'
    | 'rcra_baseline'
    | 'npdes_new'
    | 'npdes_baseline'
    | 'echo_facility';
  facilityName: string;
  registryId?: string;
  handlerId?: string;
  npdesId?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  occurredAt: string;
  program?: string;
  priorUniverse?: string;
  rcraUniverse?: string;
  direction?: 'increase' | 'decrease';
  evaluationDate?: string;
  issueDate?: string | null;
  raw?: Record<string, unknown>;
};

type EchoFacility = Record<string, unknown>;

@Injectable()
export class EchoConnector implements SignalSource {
  readonly key = 'echo';
  readonly cadence = '0 12 * * 1';
  readonly tier = 1 as const;
  private readonly logger = new Logger(EchoConnector.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Live EPA ECHO REST (air / RCRA / CWA) for Greenville metro FIPS.
   * Override with ECHO_FEED_URL → JSON array of EchoEventBody (or fixture rows).
   */
  async fetch(since: Date): Promise<RawRecord[]> {
    const feedUrl = (process.env.ECHO_FEED_URL || '').trim();
    if (feedUrl) {
      const res = await fetch(feedUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+echo-connector; industrial-signals)',
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`ECHO_FEED_URL HTTP ${res.status}`);
      const rows = (await res.json()) as unknown[];
      return rows.map((body, i) => ({
        sourceRef: echoSourceRef(body as EchoEventBody, i),
        fetchedAt: new Date(),
        body,
      }));
    }

    if (process.env.SIGNAL_ECHO_ENABLED === 'false') {
      this.logger.warn('SIGNAL_ECHO_ENABLED=false — connector idle');
      return [];
    }

    const fips = (process.env.ECHO_FIPS || '').trim() || DEFAULT_FIPS;
    const events: EchoEventBody[] = [];

    try {
      events.push(...(await this.fetchAir(fips, since)));
    } catch (err) {
      this.logger.warn(`ECHO air fetch failed: ${(err as Error).message}`);
    }
    try {
      events.push(...(await this.fetchRcra(fips)));
    } catch (err) {
      this.logger.warn(`ECHO RCRA fetch failed: ${(err as Error).message}`);
    }
    try {
      events.push(...(await this.fetchCwa(fips, since)));
    } catch (err) {
      this.logger.warn(`ECHO CWA fetch failed: ${(err as Error).message}`);
    }

    this.logger.log(`ECHO live fetch produced ${events.length} raw events`);
    return events.map((body, i) => ({
      sourceRef: echoSourceRef(body, i),
      fetchedAt: new Date(),
      body,
    }));
  }

  normalize(raw: RawRecord): SignalDraft[] {
    const b = coerceEchoBody(raw.body);
    if (!b?.facilityName) return [];

    const address = [b.address, b.city, b.state || 'SC', b.zip].filter(Boolean).join(', ');
    const occurredAt = new Date(b.occurredAt);
    const safeDate = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;

    switch (b.eventKind) {
      case 'air_fce':
        return [
          {
            type: 'ENV_PERMIT',
            subtype: 'air_fce',
            companyName: b.facilityName,
            companyAddress: address || undefined,
            siteAddress: address || undefined,
            occurredAt: safeDate,
            sourceRef: raw.sourceRef,
            headline: `CAA evaluation — ${b.facilityName}`,
            weight: 25,
            payload: {
              program: 'CAA',
              registryId: b.registryId ?? null,
              evaluationDate: b.evaluationDate ?? b.occurredAt,
              detail: 'air FCE/evaluation',
              envNote: `ECHO CAA evaluation ${b.evaluationDate ?? b.occurredAt}`,
            },
          },
        ];
      case 'rcra_change': {
        const dir = b.direction ?? 'increase';
        return [
          {
            type: 'GENERATOR_STATUS_CHANGE',
            subtype: `rcra_${dir}`,
            companyName: b.facilityName,
            companyAddress: address || undefined,
            siteAddress: address || undefined,
            occurredAt: safeDate,
            sourceRef: raw.sourceRef,
            headline: `RCRA ${dir} — ${b.facilityName} ${b.priorUniverse}→${b.rcraUniverse}`,
            weight: 35,
            payload: {
              program: 'RCRA',
              priorUniverse: b.priorUniverse ?? null,
              rcraUniverse: b.rcraUniverse ?? null,
              direction: dir,
              registryId: b.registryId ?? null,
              handlerId: b.handlerId ?? null,
              detail: `${b.priorUniverse}→${b.rcraUniverse}`,
              envNote: `RCRA generator ${dir}: ${b.priorUniverse}→${b.rcraUniverse}`,
            },
          },
        ];
      }
      case 'rcra_baseline':
        return [
          {
            type: 'ENV_PERMIT',
            subtype: 'rcra_baseline',
            companyName: b.facilityName,
            companyAddress: address || undefined,
            siteAddress: address || undefined,
            occurredAt: safeDate,
            sourceRef: raw.sourceRef,
            headline: `RCRA baseline — ${b.facilityName} (${b.rcraUniverse})`,
            weight: 5,
            payload: {
              program: 'RCRA',
              rcraUniverse: b.rcraUniverse ?? null,
              registryId: b.registryId ?? null,
              handlerId: b.handlerId ?? null,
              baseline: true,
              detail: `RCRA ${b.rcraUniverse}`,
              envNote: `ECHO RCRA baseline ${b.rcraUniverse}`,
            },
          },
        ];
      case 'npdes_new':
        return [
          {
            type: 'ENV_PERMIT',
            subtype: 'npdes_new',
            companyName: b.facilityName,
            companyAddress: address || undefined,
            siteAddress: address || undefined,
            occurredAt: safeDate,
            sourceRef: raw.sourceRef,
            headline: `New NPDES coverage — ${b.facilityName}`,
            weight: 30,
            payload: {
              program: 'CWA',
              npdesId: b.npdesId ?? null,
              registryId: b.registryId ?? null,
              issueDate: b.issueDate ?? null,
              detail: 'new NPDES',
              envNote: `ECHO new NPDES ${b.npdesId ?? ''}`.trim(),
            },
          },
        ];
      case 'npdes_baseline':
        return [
          {
            type: 'ENV_PERMIT',
            subtype: 'npdes_baseline',
            companyName: b.facilityName,
            companyAddress: address || undefined,
            siteAddress: address || undefined,
            occurredAt: safeDate,
            sourceRef: raw.sourceRef,
            headline: `NPDES baseline — ${b.facilityName}`,
            weight: 5,
            payload: {
              program: 'CWA',
              npdesId: b.npdesId ?? null,
              registryId: b.registryId ?? null,
              issueDate: b.issueDate ?? null,
              baseline: true,
              detail: 'NPDES baseline',
              envNote: `ECHO NPDES baseline ${b.npdesId ?? ''}`.trim(),
            },
          },
        ];
      default:
        return [
          {
            type: 'ENV_PERMIT',
            subtype: 'echo_facility',
            companyName: b.facilityName,
            companyAddress: address || undefined,
            siteAddress: address || undefined,
            occurredAt: safeDate,
            sourceRef: raw.sourceRef,
            headline: `ECHO facility — ${b.facilityName}`,
            weight: 20,
            payload: {
              program: b.program ?? 'ECHO',
              registryId: b.registryId ?? null,
              detail: 'ECHO facility',
              envNote: 'ECHO facility record',
            },
          },
        ];
    }
  }

  private async fetchAir(fips: string, since: Date): Promise<EchoEventBody[]> {
    const qid = await this.startQuery('air_rest_services', {
      output: 'JSON',
      p_st: 'SC',
      p_fips: fips,
      p_act: 'Y',
    });
    const facilities = await this.pageFacilities('air_rest_services', qid);
    const out: EchoEventBody[] = [];
    const sinceMs = since.getTime();

    for (const f of facilities) {
      const evalDate = parseEchoDate(
        str(f.AirEvaluationDate ?? f.AIREvaluationDate ?? f.LastInspDate),
      );
      if (!evalDate || evalDate.getTime() < sinceMs) continue;
      const name = str(f.FAC_NAME ?? f.FacilityName ?? f.AIRName);
      const registry = str(f.REGISTRY_ID ?? f.RegistryID);
      if (!name) continue;

      out.push({
        eventKind: 'air_fce',
        facilityName: name,
        registryId: registry || undefined,
        address: str(f.FAC_STREET ?? f.Address) || undefined,
        city: str(f.FAC_CITY ?? f.City) || undefined,
        state: str(f.FAC_STATE ?? f.State) || 'SC',
        zip: str(f.FAC_ZIP ?? f.Zip) || undefined,
        lat: num(f.FAC_LAT ?? f.Latitude),
        lon: num(f.FAC_LONG ?? f.Longitude),
        occurredAt: evalDate.toISOString(),
        evaluationDate: evalDate.toISOString().slice(0, 10),
        program: 'CAA',
        raw: pickKeys(f, [
          'FAC_NAME',
          'REGISTRY_ID',
          'FAC_STREET',
          'FAC_CITY',
          'FAC_STATE',
          'FAC_ZIP',
          'AirEvaluationDate',
          'AIREvaluationDate',
        ]),
      });
    }
    return out;
  }

  private async fetchRcra(fips: string): Promise<EchoEventBody[]> {
    const qid = await this.startQuery('rcra_rest_services', {
      output: 'JSON',
      p_st: 'SC',
      p_fips: fips,
      p_act: 'Y',
    });
    const facilities = await this.pageFacilities('rcra_rest_services', qid);
    const out: EchoEventBody[] = [];

    for (const f of facilities) {
      const name = str(f.FAC_NAME ?? f.FacilityName);
      const registry = str(f.REGISTRY_ID ?? f.RegistryID);
      const handler = str(f.HANDLER_ID ?? f.HandlerID ?? f.RCRA_ID);
      const universe = normalizeRcraUniverse(
        str(
          f.GENERATOR_STATUS ??
            f.GeneratorStatus ??
            f.UNIVERSE ??
            f.Universe ??
            f.FAC_GENERATOR_STATUS_CODE,
        ),
      );
      if (!name || !universe) continue;

      const key = registry || handler || name;
      const prior = await this.loadPriorRcra(key);
      const base = {
        facilityName: name,
        registryId: registry || undefined,
        handlerId: handler || undefined,
        address: str(f.FAC_STREET ?? f.Address) || undefined,
        city: str(f.FAC_CITY ?? f.City) || undefined,
        state: str(f.FAC_STATE ?? f.State) || 'SC',
        zip: str(f.FAC_ZIP ?? f.Zip) || undefined,
        lat: num(f.FAC_LAT ?? f.Latitude),
        lon: num(f.FAC_LONG ?? f.Longitude),
        occurredAt: new Date().toISOString(),
        program: 'RCRA',
        rcraUniverse: universe,
      };

      if (!prior) {
        out.push({ ...base, eventKind: 'rcra_baseline' });
        continue;
      }
      if (prior === universe) continue;

      const direction =
        rcraRank(universe) > rcraRank(prior) ? 'increase' : 'decrease';
      out.push({
        ...base,
        eventKind: 'rcra_change',
        priorUniverse: prior,
        direction,
      });
    }
    return out;
  }

  private async fetchCwa(fips: string, since: Date): Promise<EchoEventBody[]> {
    const qid = await this.startQuery('cwa_rest_services', {
      output: 'JSON',
      p_st: 'SC',
      p_fips: fips,
      p_act: 'Y',
    });
    const facilities = await this.pageFacilities('cwa_rest_services', qid);
    const out: EchoEventBody[] = [];
    const sinceMs = since.getTime();

    for (const f of facilities) {
      const name = str(f.FAC_NAME ?? f.FacilityName);
      const registry = str(f.REGISTRY_ID ?? f.RegistryID);
      const npdes = str(f.NPDES_ID ?? f.SOURCE_ID ?? f.CWPName);
      const issueDate = parseEchoDate(
        str(f.ISSUE_DATE ?? f.IssueDate ?? f.CWPPermitStatusDate),
      );
      if (!name) continue;

      const key = registry || npdes || name;
      const seen = await this.hasPriorCwa(key);
      const base = {
        facilityName: name,
        registryId: registry || undefined,
        npdesId: npdes || undefined,
        address: str(f.FAC_STREET ?? f.Address) || undefined,
        city: str(f.FAC_CITY ?? f.City) || undefined,
        state: str(f.FAC_STATE ?? f.State) || 'SC',
        zip: str(f.FAC_ZIP ?? f.Zip) || undefined,
        lat: num(f.FAC_LAT ?? f.Latitude),
        lon: num(f.FAC_LONG ?? f.Longitude),
        occurredAt: (issueDate ?? new Date()).toISOString(),
        program: 'CWA',
        issueDate: issueDate?.toISOString().slice(0, 10) ?? null,
      };

      if (!seen) {
        if (issueDate && issueDate.getTime() >= sinceMs) {
          out.push({ ...base, eventKind: 'npdes_new' });
        } else {
          out.push({ ...base, eventKind: 'npdes_baseline' });
        }
      }
    }
    return out;
  }

  private async loadPriorRcra(key: string): Promise<string | null> {
    const exact = await this.prisma.industrialSignal.findMany({
      where: {
        source: 'echo',
        OR: [
          { sourceRef: { startsWith: `echo:rcra:baseline:${key}` } },
          { sourceRef: { startsWith: `echo:rcra:${key}:` } },
        ],
      },
      orderBy: { observedAt: 'desc' },
      take: 5,
      select: { payload: true, sourceRef: true },
    });

    for (const row of exact) {
      const p = row.payload as Record<string, unknown> | null;
      const u = p?.rcraUniverse != null ? String(p.rcraUniverse) : null;
      if (u) return normalizeRcraUniverse(u);
      const m = row.sourceRef.match(/echo:rcra:baseline:[^:]+:(.+)$/);
      if (m?.[1]) return normalizeRcraUniverse(m[1]);
    }

    const byPayload = await this.prisma.industrialSignal.findMany({
      where: {
        source: 'echo',
        type: { in: ['GENERATOR_STATUS_CHANGE', 'ENV_PERMIT'] },
        OR: [{ subtype: { startsWith: 'rcra_' } }, { subtype: 'rcra_baseline' }],
      },
      orderBy: { observedAt: 'desc' },
      take: 400,
      select: { payload: true },
    });
    for (const row of byPayload) {
      const p = row.payload as Record<string, unknown> | null;
      if (!p) continue;
      const rid = p.registryId != null ? String(p.registryId) : '';
      const hid = p.handlerId != null ? String(p.handlerId) : '';
      if (rid !== key && hid !== key) continue;
      const u = p.rcraUniverse != null ? String(p.rcraUniverse) : null;
      if (u) return normalizeRcraUniverse(u);
    }
    return null;
  }

  private async hasPriorCwa(key: string): Promise<boolean> {
    const byRef = await this.prisma.industrialSignal.findFirst({
      where: {
        source: 'echo',
        OR: [
          { sourceRef: `echo:cwa:baseline:${key}` },
          { sourceRef: `echo:cwa:new:${key}` },
        ],
      },
      select: { id: true },
    });
    if (byRef) return true;

    const recent = await this.prisma.industrialSignal.findMany({
      where: {
        source: 'echo',
        type: 'ENV_PERMIT',
        subtype: { in: ['npdes_baseline', 'npdes_new'] },
      },
      orderBy: { observedAt: 'desc' },
      take: 400,
      select: { payload: true, sourceRef: true },
    });
    return recent.some((row) => {
      if (row.sourceRef.includes(key)) return true;
      const p = row.payload as Record<string, unknown> | null;
      return (
        (p?.registryId != null && String(p.registryId) === key) ||
        (p?.npdesId != null && String(p.npdesId) === key)
      );
    });
  }

  private async startQuery(
    service: string,
    params: Record<string, string>,
  ): Promise<string> {
    const qs = new URLSearchParams(params);
    const url = `${ECHO_BASE}/${service}.get_facilities?${qs}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${service}.get_facilities HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    const results = (data.Results ?? data) as Record<string, unknown>;
    const qid = str(results.QueryID ?? data.QueryID);
    if (!qid) throw new Error(`${service}: no QueryID`);
    return qid;
  }

  private async pageFacilities(
    service: string,
    qid: string,
    maxPages = 5,
  ): Promise<EchoFacility[]> {
    const all: EchoFacility[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const qs = new URLSearchParams({
        output: 'JSON',
        qid,
        pageno: String(page),
        pagesize: '500',
      });
      const url = `${ECHO_BASE}/${service}.get_qid?${qs}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) break;
      const data = (await res.json()) as Record<string, unknown>;
      const results = (data.Results ?? data) as Record<string, unknown>;
      const list = results.Facilities ?? results.facilities ?? data.Facilities;
      const facilities = Array.isArray(list) ? (list as EchoFacility[]) : [];
      if (!facilities.length) break;
      all.push(...facilities);
      if (facilities.length < 500) break;
    }
    return all;
  }
}

function echoSourceRef(body: EchoEventBody, index: number): string {
  const name = body.facilityName || `row-${index}`;
  const key = body.registryId || body.handlerId || body.npdesId || name;
  switch (body.eventKind) {
    case 'air_fce':
      return `echo:air:${key}:${(body.evaluationDate || body.occurredAt || '').slice(0, 10)}`;
    case 'rcra_change':
      return `echo:rcra:${key}:${body.priorUniverse}->${body.rcraUniverse}`;
    case 'rcra_baseline':
      return `echo:rcra:baseline:${key}:${body.rcraUniverse}`;
    case 'npdes_new':
      return `echo:cwa:new:${key}`;
    case 'npdes_baseline':
      return `echo:cwa:baseline:${key}`;
    default:
      return `echo:facility:${key}`;
  }
}

function coerceEchoBody(body: unknown): EchoEventBody | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  if (row.eventKind && row.facilityName) {
    return row as unknown as EchoEventBody;
  }
  // Allow loose fixture rows matching FAC_* shape
  const name = str(row.FAC_NAME ?? row.facilityName ?? row.companyName);
  if (!name) return null;
  return {
    eventKind: (str(row.eventKind) as EchoEventBody['eventKind']) || 'echo_facility',
    facilityName: name,
    registryId: str(row.REGISTRY_ID ?? row.registryId) || undefined,
    address: str(row.FAC_STREET ?? row.address) || undefined,
    city: str(row.FAC_CITY ?? row.city) || undefined,
    state: str(row.FAC_STATE ?? row.state) || 'SC',
    zip: str(row.FAC_ZIP ?? row.zip) || undefined,
    occurredAt: str(row.occurredAt) || new Date().toISOString(),
    program: str(row.program) || 'ECHO',
    priorUniverse: str(row.priorUniverse) || undefined,
    rcraUniverse: str(row.rcraUniverse) || undefined,
    direction: row.direction === 'decrease' ? 'decrease' : row.direction === 'increase' ? 'increase' : undefined,
  };
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseEchoDate(raw: string): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeRcraUniverse(raw: string): string | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (/\bLQG\b|LARGE/.test(u) || u === 'LQG') return 'LQG';
  if (/\bSQG\b|SMALL/.test(u) || u === 'SQG') return 'SQG';
  if (/\bVSQG\b|VERY\s*SMALL|CESQG/.test(u) || u === 'VSQG') return 'VSQG';
  return u.slice(0, 32) || null;
}

function rcraRank(u: string): number {
  if (u === 'LQG') return 3;
  if (u === 'SQG') return 2;
  if (u === 'VSQG') return 1;
  return 0;
}

function pickKeys(obj: EchoFacility, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (obj[k] != null) out[k] = obj[k];
  }
  return out;
}
