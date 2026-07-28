import { Injectable, Logger } from '@nestjs/common';
import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';

const TARGET_COUNTIES = ['GREENVILLE', 'SPARTANBURG', 'ANDERSON', 'LAURENS', 'PICKENS'];

const TAXONOMY: Array<{ subtype: string; weight: number; keywords: string[] }> = [
  {
    subtype: 'material_handling',
    weight: 35,
    keywords: ['racking', 'conveyor', 'as/rs', 'asrs', 'mezzanine', 'pallet shuttle', 'sortation'],
  },
  {
    subtype: 'production_equipment',
    weight: 30,
    keywords: ['cnc', 'press', 'injection mold', 'lathe', 'extruder', 'mill', 'stamping'],
  },
  {
    subtype: 'fleet',
    weight: 25,
    keywords: ['tractor', 'trailer', 'yard truck', 'box truck', 'semi'],
  },
  {
    subtype: 'forklift',
    weight: 15,
    keywords: ['forklift', 'reach truck', 'order picker', 'pallet jack'],
  },
];

export type UccFilingBody = {
  filingNumber: string;
  filingDate: string;
  debtorName: string;
  debtorAddress?: string;
  debtorCounty?: string;
  securedParty?: string;
  collateral?: string;
  action?: 'filing' | 'termination';
  html?: string;
};

@Injectable()
export class UccConnector implements SignalSource {
  readonly key = 'ucc';
  readonly cadence = '0 10 * * *';
  readonly tier = 1 as const;
  private readonly logger = new Logger(UccConnector.name);

  /**
   * Live SC SOS UCC search is login/CAPTCHA gated. Production ingest prefers
   * admin-pasted / fixture JSON until a bulk feed is available. When
   * UCC_FEED_URL is set, fetch that JSON array of filings.
   */
  async fetch(since: Date): Promise<RawRecord[]> {
    const feedUrl = (process.env.UCC_FEED_URL || '').trim();
    if (!feedUrl) {
      this.logger.warn(
        'UCC_FEED_URL unset — connector idle (use Admin paste or fixtures). Respect SOS robots.txt when wiring a scraper.',
      );
      return [];
    }

    const res = await fetch(feedUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+ucc-connector; industrial-signals)',
      },
    });
    if (!res.ok) {
      throw new Error(`UCC feed HTTP ${res.status}`);
    }
    const body = (await res.json()) as UccFilingBody[];
    const sinceMs = since.getTime();
    return body
      .filter((f) => {
        const county = (f.debtorCounty || '').toUpperCase();
        if (county && !TARGET_COUNTIES.some((c) => county.includes(c))) return false;
        const d = new Date(f.filingDate);
        return !Number.isNaN(d.getTime()) && d.getTime() >= sinceMs;
      })
      .map((f) => ({
        sourceRef: f.filingNumber,
        fetchedAt: new Date(),
        body: f,
      }));
  }

  normalize(raw: RawRecord): SignalDraft[] {
    const f = raw.body as UccFilingBody;
    if (!f?.filingNumber || !f.debtorName) return [];

    const collateral = (f.collateral || '').toLowerCase();
    const action = f.action || 'filing';
    let subtype = 'generic';
    let weight = 8;

    if (action === 'termination') {
      subtype = 'termination';
      weight = 20;
    } else {
      for (const row of TAXONOMY) {
        if (row.keywords.some((k) => collateral.includes(k))) {
          subtype = row.subtype;
          weight = row.weight;
          break;
        }
      }
    }

    const detail =
      subtype === 'generic'
        ? (f.collateral || 'equipment financing').slice(0, 80)
        : subtype.replace(/_/g, ' ');

    const headline =
      action === 'termination'
        ? `UCC termination — ${f.debtorName} (${detail})`
        : `UCC-1 ${subtype.replace(/_/g, ' ')} — ${f.debtorName}`;

    return [
      {
        type: 'EQUIPMENT_FINANCING',
        subtype,
        companyName: f.debtorName,
        companyAddress: f.debtorAddress,
        siteAddress: f.debtorAddress,
        occurredAt: new Date(f.filingDate),
        sourceRef: f.filingNumber,
        headline,
        weight,
        payload: {
          filingNumber: f.filingNumber,
          securedParty: f.securedParty ?? null,
          collateral: f.collateral ?? null,
          debtorCounty: f.debtorCounty ?? null,
          action,
          detail,
        },
      },
    ];
  }
}
