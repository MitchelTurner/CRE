import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';
import {
  filterTargetCounties,
  joinUccBulkFiles,
  parseUccCsv,
} from './ucc-bulk.parser';

export const UCC_TARGET_COUNTIES = [
  'GREENVILLE',
  'SPARTANBURG',
  'ANDERSON',
  'LAURENS',
  'PICKENS',
];

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
   * Live ingest order:
   * 1) UCC_FEED_URL → JSON array of UccFilingBody
   * 2) UCC_BULK_CSV_URL → normalized CSV
   * 3) UCC_BULK_DIR → SCI monthly drop (filings + parties CSVs)
   *
   * Interactive SOS search remains CAPTCHA/login gated — use SCI bulk
   * subscription (~$12k/yr) or Admin paste. Do not scrape ucconline.sc.gov.
   */
  async fetch(since: Date): Promise<RawRecord[]> {
    const feedUrl = (process.env.UCC_FEED_URL || '').trim();
    if (feedUrl) {
      return this.fromJsonFeed(feedUrl, since);
    }

    const csvUrl = (process.env.UCC_BULK_CSV_URL || '').trim();
    if (csvUrl) {
      const res = await fetch(csvUrl, {
        headers: {
          Accept: 'text/csv,text/plain,*/*',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+ucc-connector; industrial-signals)',
        },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`UCC_BULK_CSV_URL HTTP ${res.status}`);
      const filings = filterTargetCounties(parseUccCsv(await res.text()), UCC_TARGET_COUNTIES, since);
      this.logger.log(`UCC CSV URL produced ${filings.length} filings`);
      return filings.map((f) => ({
        sourceRef: f.filingNumber,
        fetchedAt: new Date(),
        body: f,
      }));
    }

    const bulkDir = (process.env.UCC_BULK_DIR || '').trim();
    if (bulkDir) {
      const filings = await this.fromBulkDir(bulkDir, since);
      this.logger.log(`UCC bulk dir ${bulkDir} produced ${filings.length} filings`);
      return filings.map((f) => ({
        sourceRef: f.filingNumber,
        fetchedAt: new Date(),
        body: f,
      }));
    }

    this.logger.warn(
      'UCC idle — set UCC_FEED_URL, UCC_BULK_CSV_URL, or UCC_BULK_DIR (SCI monthly drop). Admin paste still works. Do not scrape CAPTCHA-gated SOS search.',
    );
    return [];
  }

  /** Readiness for Admin / Signals. */
  status() {
    const feedUrl = Boolean((process.env.UCC_FEED_URL || '').trim());
    const bulkCsvUrl = Boolean((process.env.UCC_BULK_CSV_URL || '').trim());
    const bulkDir = (process.env.UCC_BULK_DIR || '').trim();
    return {
      ready: feedUrl || bulkCsvUrl || Boolean(bulkDir),
      mode: feedUrl
        ? 'json_feed'
        : bulkCsvUrl
          ? 'csv_url'
          : bulkDir
            ? 'bulk_dir'
            : 'paste_only',
      feedUrlSet: feedUrl,
      bulkCsvUrlSet: bulkCsvUrl,
      bulkDir: bulkDir || null,
      targetCounties: UCC_TARGET_COUNTIES,
      signupUrl:
        'https://scdgs.sc.gov/service/secretary-state-bulk-data-images-and-notary-registration',
      note: feedUrl || bulkCsvUrl || bulkDir
        ? 'Live UCC path configured'
        : 'Subscribe to SCI UCC bulk (monthly CSV) or paste filings on Signals',
    };
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

  /** Parse Admin-pasted CSV into filings (county + optional since filter applied by caller). */
  parseCsvText(csv: string, since?: Date): UccFilingBody[] {
    return filterTargetCounties(parseUccCsv(csv), UCC_TARGET_COUNTIES, since);
  }

  private async fromJsonFeed(feedUrl: string, since: Date): Promise<RawRecord[]> {
    const res = await fetch(feedUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+ucc-connector; industrial-signals)',
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`UCC feed HTTP ${res.status}`);
    const body = (await res.json()) as UccFilingBody[];
    return filterTargetCounties(body, UCC_TARGET_COUNTIES, since).map((f) => ({
      sourceRef: f.filingNumber,
      fetchedAt: new Date(),
      body: f,
    }));
  }

  private async fromBulkDir(dir: string, since: Date): Promise<UccFilingBody[]> {
    const names = await readdir(dir);
    const lower = names.map((n) => ({ n, l: n.toLowerCase() }));

    const normalized = lower.find(
      (f) =>
        f.l.includes('normalized') ||
        f.l === 'ucc.csv' ||
        f.l.endsWith('ucc-filings.csv') ||
        f.l === 'filings_normalized.csv',
    );
    if (normalized) {
      const text = await readFile(join(dir, normalized.n), 'utf8');
      return filterTargetCounties(parseUccCsv(text), UCC_TARGET_COUNTIES, since);
    }

    const filingsFile = lower.find(
      (f) =>
        f.l.includes('ucc_1') ||
        f.l.includes('ucc1') ||
        f.l === 'filings.csv' ||
        f.l.includes('documents.csv') ||
        f.l.includes('ucc_filing'),
    );
    const partiesFile = lower.find(
      (f) =>
        f.l.includes('ucc_party') ||
        f.l.includes('parties.csv') ||
        f.l.includes('debtors.csv') ||
        (f.l.includes('party') && !f.l.includes('conn')),
    );

    const filingsCsv = filingsFile
      ? await readFile(join(dir, filingsFile.n), 'utf8')
      : undefined;
    const partiesCsv = partiesFile
      ? await readFile(join(dir, partiesFile.n), 'utf8')
      : undefined;

    if (!filingsCsv && !partiesCsv) {
      // Any single .csv as normalized
      const anyCsv = lower.find((f) => f.l.endsWith('.csv'));
      if (!anyCsv) {
        this.logger.warn(`UCC_BULK_DIR ${dir} has no CSV files`);
        return [];
      }
      const text = await readFile(join(dir, anyCsv.n), 'utf8');
      return filterTargetCounties(parseUccCsv(text), UCC_TARGET_COUNTIES, since);
    }

    const joined = joinUccBulkFiles({ filingsCsv, partiesCsv });
    return filterTargetCounties(joined, UCC_TARGET_COUNTIES, since);
  }
}
