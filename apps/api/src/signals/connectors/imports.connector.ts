import { Injectable, Logger } from '@nestjs/common';
import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';

/** Greer / Inland Port Greer consignee geography. */
const GREER_AREA = [
  'GREER',
  'DUNCAN',
  'LYMAN',
  'WELLFORD',
  'TAYLORS',
  'GREENVILLE',
  'PIEDMONT',
  'FOUNTAIN INN',
];

export type ImportVolumeBody = {
  consigneeName: string;
  consigneeStreet?: string;
  consigneeCity?: string;
  consigneeState?: string;
  consigneeZip?: string;
  period: string; // YYYY-MM
  teu?: number;
  containerCount?: number;
  priorTeu?: number | null;
  priorContainerCount?: number | null;
  port?: string;
  sourceSystem?: string;
};

/**
 * Tier-2 BOL import volume (ImportGenius / Panjiva style feeds).
 * Opt-in: SIGNAL_IMPORTS_ENABLED=true + IMPORTS_FEED_URL, or Admin paste.
 */
@Injectable()
export class ImportsConnector implements SignalSource {
  readonly key = 'imports';
  readonly cadence = '0 14 * * 1';
  readonly tier = 2 as const;
  private readonly logger = new Logger(ImportsConnector.name);

  async fetch(since: Date): Promise<RawRecord[]> {
    if (process.env.SIGNAL_IMPORTS_ENABLED !== 'true') {
      this.logger.debug('SIGNAL_IMPORTS_ENABLED not true — imports idle');
      return [];
    }
    const feedUrl = (process.env.IMPORTS_FEED_URL || '').trim();
    if (!feedUrl) {
      this.logger.warn('IMPORTS_FEED_URL unset — use Admin paste for BOL rows');
      return [];
    }
    const res = await fetch(feedUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+imports-connector; industrial-signals)',
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`IMPORTS_FEED_URL HTTP ${res.status}`);
    const rows = (await res.json()) as ImportVolumeBody[];
    const sinceMs = since.getTime();
    return rows
      .filter((r) => {
        if (!isGreerArea(r)) return false;
        const d = periodToDate(r.period);
        return d.getTime() >= sinceMs;
      })
      .map((body) => ({
        sourceRef: `imports:${body.consigneeName}:${body.period}`.slice(0, 200),
        fetchedAt: new Date(),
        body,
      }));
  }

  normalize(raw: RawRecord): SignalDraft[] {
    const b = raw.body as ImportVolumeBody;
    if (!b?.consigneeName || !b.period) return [];
    if (!isGreerArea(b)) return [];

    const teu = Number(b.teu ?? b.containerCount ?? 0);
    const prior =
      b.priorTeu != null
        ? Number(b.priorTeu)
        : b.priorContainerCount != null
          ? Number(b.priorContainerCount)
          : null;

    // Growth rule: ≥25% and ≥10 TEU absolute, or new consignee with ≥20 TEU
    let growing = false;
    if (prior == null || prior <= 0) {
      growing = teu >= 20;
    } else {
      const delta = teu - prior;
      const pct = (delta / prior) * 100;
      growing = delta >= 10 && pct >= 25;
    }
    if (!growing) return [];

    const address = [
      b.consigneeStreet,
      b.consigneeCity,
      b.consigneeState || 'SC',
      b.consigneeZip,
    ]
      .filter(Boolean)
      .join(', ');
    const detail =
      prior == null
        ? `${teu} TEU (${b.period})`
        : `${prior}→${teu} TEU (${b.period})`;

    return [
      {
        type: 'IMPORT_VOLUME',
        subtype: 'growth',
        companyName: b.consigneeName,
        companyAddress: address || undefined,
        siteAddress: address || undefined,
        occurredAt: periodToDate(b.period),
        sourceRef: raw.sourceRef,
        headline: `Import volume up — ${b.consigneeName} (${detail})`,
        weight: 30,
        payload: {
          teu,
          priorTeu: prior,
          period: b.period,
          port: b.port ?? 'Inland Port Greer',
          sourceSystem: b.sourceSystem ?? 'bol_feed',
          detail,
          // Licensed BOL data — do not republish in client-facing reports.
          internalOnly: true,
        },
      },
    ];
  }
}

function isGreerArea(b: ImportVolumeBody): boolean {
  const state = (b.consigneeState || 'SC').toUpperCase();
  if (state && state !== 'SC' && state !== 'SOUTH CAROLINA') return false;
  const city = (b.consigneeCity || '').toUpperCase();
  if (!city) return true; // allow paste without city when already curated
  return GREER_AREA.some((c) => city.includes(c));
}

function periodToDate(period: string): Date {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15));
}
