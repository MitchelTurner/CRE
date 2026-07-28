import { Injectable, Logger } from '@nestjs/common';
import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';

const TARGET_COUNTIES = ['GREENVILLE', 'SPARTANBURG', 'ANDERSON', 'LAURENS', 'PICKENS'];

/** Manufacturing, wholesale, transportation/warehousing NAICS prefixes. */
const INDUSTRIAL_NAICS_PREFIXES = ['31', '32', '33', '42', '48', '49'];

export type SbaLoanBody = {
  program: '504' | '7a' | string;
  approvalDate: string;
  borrowerName: string;
  borrowerStreet?: string;
  borrowerCity?: string;
  borrowerState?: string;
  borrowerZip?: string;
  borrowerCounty?: string;
  projectCounty?: string;
  projectState?: string;
  naicsCode?: string;
  naicsDescription?: string;
  grossApproval?: number;
  bankName?: string;
  loanNumber?: string;
  asOfDate?: string;
};

@Injectable()
export class SbaConnector implements SignalSource {
  readonly key = 'sba';
  readonly cadence = '0 13 1 1,4,7,10 *';
  readonly tier = 1 as const;
  private readonly logger = new Logger(SbaConnector.name);

  /**
   * SBA FOIA loan approvals. Prefer:
   * - SBA_FEED_URL → JSON array of SbaLoanBody
   * - SBA_504_CSV_URL / SBA_7A_CSV_URL → FOIA CSVs
   * Admin paste uses the same JSON shape (see fixtures).
   */
  async fetch(since: Date): Promise<RawRecord[]> {
    const records: RawRecord[] = [];
    const feedUrl = (process.env.SBA_FEED_URL || '').trim();
    if (feedUrl) {
      const res = await fetch(feedUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+sba-connector; industrial-signals)',
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`SBA_FEED_URL HTTP ${res.status}`);
      const rows = (await res.json()) as SbaLoanBody[];
      return this.filterRows(rows, since).map((body) => ({
        sourceRef: sbaSourceRef(body),
        fetchedAt: new Date(),
        body,
      }));
    }

    const csv504 = (process.env.SBA_504_CSV_URL || '').trim();
    const csv7a = (process.env.SBA_7A_CSV_URL || '').trim();
    if (!csv504 && !csv7a) {
      this.logger.warn(
        'SBA_FEED_URL / SBA_504_CSV_URL / SBA_7A_CSV_URL unset — connector idle (use Admin paste)',
      );
      return [];
    }

    if (csv504) {
      records.push(...(await this.fetchCsv(csv504, '504', since)));
    }
    if (csv7a) {
      records.push(...(await this.fetchCsv(csv7a, '7a', since)));
    }
    this.logger.log(`SBA fetch produced ${records.length} raw rows`);
    return records;
  }

  normalize(raw: RawRecord): SignalDraft[] {
    const b = raw.body as SbaLoanBody;
    if (!b?.borrowerName || !b.approvalDate) return [];

    const program = normalizeProgram(b.program);
    const subtype = program === '504' ? '504' : '7a';
    const weight = program === '504' ? 30 : 20;
    const address = [
      b.borrowerStreet,
      b.borrowerCity,
      b.borrowerState || 'SC',
      b.borrowerZip,
    ]
      .filter(Boolean)
      .join(', ');
    const amount =
      b.grossApproval != null && Number.isFinite(Number(b.grossApproval))
        ? Number(b.grossApproval)
        : null;
    const amountLabel = amount != null ? `$${Math.round(amount).toLocaleString('en-US')}` : 'n/a';
    const occurredAt = new Date(b.approvalDate);
    const safeDate = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;

    return [
      {
        type: 'SBA_LOAN',
        subtype,
        companyName: b.borrowerName,
        companyAddress: address || undefined,
        siteAddress: address || undefined,
        occurredAt: safeDate,
        sourceRef: raw.sourceRef,
        headline: `SBA ${subtype} — ${b.borrowerName} (${amountLabel})`,
        weight,
        naics: b.naicsCode ? String(b.naicsCode).slice(0, 6) : undefined,
        payload: {
          program: subtype,
          grossApproval: amount,
          bankName: b.bankName ?? null,
          naicsCode: b.naicsCode ?? null,
          naicsDescription: b.naicsDescription ?? null,
          borrowerCounty: b.borrowerCounty ?? null,
          projectCounty: b.projectCounty ?? null,
          loanNumber: b.loanNumber ?? null,
          nurture: true,
          nurtureHorizonMonths: subtype === '504' ? 36 : 24,
          detail: `${subtype} ${amountLabel}`,
        },
      },
    ];
  }

  private async fetchCsv(
    url: string,
    programHint: '504' | '7a',
    since: Date,
  ): Promise<RawRecord[]> {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/csv,application/json,*/*',
        'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+sba-connector; industrial-signals)',
      },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`SBA CSV HTTP ${res.status} (${programHint})`);
    const text = await res.text();
    const rows = parseCsv(text).map((r) => mapCsvRow(r, programHint));
    return this.filterRows(rows, since).map((body) => ({
      sourceRef: sbaSourceRef(body),
      fetchedAt: new Date(),
      body,
    }));
  }

  private filterRows(rows: SbaLoanBody[], since: Date): SbaLoanBody[] {
    const sinceMs = since.getTime();
    return rows.filter((r) => {
      if (!r.borrowerName || !r.approvalDate) return false;
      const state = (r.projectState || r.borrowerState || '').toUpperCase();
      if (state && state !== 'SC' && state !== 'SOUTH CAROLINA') return false;
      const county = (r.projectCounty || r.borrowerCounty || '').toUpperCase();
      if (county && !TARGET_COUNTIES.some((c) => county.includes(c))) return false;
      if (r.naicsCode && !isIndustrialNaics(String(r.naicsCode))) return false;
      const d = new Date(r.approvalDate);
      return !Number.isNaN(d.getTime()) && d.getTime() >= sinceMs;
    });
  }
}

function sbaSourceRef(body: SbaLoanBody): string {
  const prog = normalizeProgram(body.program);
  const id =
    body.loanNumber ||
    `${body.borrowerName}:${body.approvalDate}:${body.grossApproval ?? ''}`;
  return `sba:${prog}:${id}`.slice(0, 200);
}

function normalizeProgram(raw: string): '504' | '7a' {
  const p = (raw || '').toLowerCase();
  if (p.includes('504') || p.includes('cdc')) return '504';
  return '7a';
}

function isIndustrialNaics(code: string): boolean {
  const digits = code.replace(/\D/g, '');
  if (digits.length < 2) return true; // allow missing/partial
  return INDUSTRIAL_NAICS_PREFIXES.some((p) => digits.startsWith(p));
}

function mapCsvRow(row: Record<string, string>, programHint: '504' | '7a'): SbaLoanBody {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
      if (hit && row[hit]?.trim()) return row[hit]!.trim();
    }
    return '';
  };

  const programRaw = get('Program', 'program', 'LoanType', 'LoanProgram') || programHint;
  const gross = get('GrossApproval', 'grossApproval', 'GrossApprovalAmount', 'ApprovalAmount');
  return {
    program: programRaw,
    approvalDate: normalizeDate(
      get('ApprovalDate', 'approvalDate', 'AsOfDate', 'FirstDisbursementDate'),
    ),
    borrowerName: get('BorrName', 'borrowerName', 'BorrowerName', 'Name'),
    borrowerStreet: get('BorrStreet', 'borrowerStreet', 'BorrowerStreet') || undefined,
    borrowerCity: get('BorrCity', 'borrowerCity', 'BorrowerCity') || undefined,
    borrowerState: get('BorrState', 'borrowerState', 'BorrowerState') || undefined,
    borrowerZip: get('BorrZip', 'borrowerZip', 'BorrowerZip') || undefined,
    borrowerCounty: get('BorrCounty', 'borrowerCounty', 'BorrowerCounty') || undefined,
    projectCounty: get('ProjectCounty', 'projectCounty') || undefined,
    projectState: get('ProjectState', 'projectState') || undefined,
    naicsCode: get('NaicsCode', 'naicsCode', 'NAICS', 'Naics') || undefined,
    naicsDescription: get('NaicsDescription', 'naicsDescription') || undefined,
    grossApproval: gross ? Number(gross.replace(/[,$]/g, '')) : undefined,
    bankName: get('BankName', 'bankName', 'LenderName') || undefined,
    loanNumber:
      get('LoanNumber', 'loanNumber', 'FolioNumber', 'SBAGuarantyNumber') || undefined,
    asOfDate: get('AsOfDate', 'asOfDate') || undefined,
  };
}

function normalizeDate(raw: string): string {
  if (!raw) return '';
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

/** Minimal CSV parser (quoted fields, commas). */
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]!);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    if (!cols.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}
