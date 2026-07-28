import type { UccFilingBody } from './ucc.connector';

/**
 * Flexible SC UCC bulk CSV parser.
 *
 * Supports:
 * 1) Normalized single CSV (preferred intermediate format)
 * 2) SCI-style multi-file drop: filings + parties joined on filing number
 * 3) Header aliases from common Tyler / SOS bulk exports
 *
 * Official SC bulk arrives monthly via SCI subscriber FTP as
 * UCC_1.zip / UCC_3.zip / UCC_PARTY.zip / UCC_PARTY_CONN.zip (~$12k/yr).
 * Exact layouts are provided after subscription — map via headers or
 * UCC_BULK_COLUMN_MAP JSON env.
 */

export type BulkColumnMap = {
  filingNumber?: string;
  filingDate?: string;
  debtorName?: string;
  debtorAddress?: string;
  debtorCity?: string;
  debtorState?: string;
  debtorZip?: string;
  debtorCounty?: string;
  securedParty?: string;
  collateral?: string;
  action?: string;
  partyType?: string;
  partyName?: string;
};

const DEFAULT_MAP: Required<BulkColumnMap> = {
  filingNumber: 'filingNumber|FileNumber|FILE_NBR|UCC_ID|UccId|DocumentNumber|DocNumber|LapseID',
  filingDate: 'filingDate|FileDate|FILE_DATE|DocumentDate|FilingDate|DateFiled',
  debtorName: 'debtorName|Debtor_Name|DebtorName|DEBTOR_NAME|Name',
  debtorAddress: 'debtorAddress|DebtorAddress|Address|ADDRESS|Street|MailAddress',
  debtorCity: 'debtorCity|City|CITY|DebtorCity',
  debtorState: 'debtorState|State|STATE|DebtorState',
  debtorZip: 'debtorZip|Zip|ZIP|ZipCode|DebtorZip',
  debtorCounty: 'debtorCounty|County|COUNTY|DebtorCounty',
  securedParty: 'securedParty|SecuredParty_Name|SecuredParty|SECURED_PARTY|SecuredPartyName',
  collateral: 'collateral|Collateral|COLLATERAL|CollateralText|CollateralDescription',
  action: 'action|Action|DocumentType|UccDocumentType|FilingType|Status',
  partyType: 'partyType|PartyType|PARTY_TYPE|Role|PartyRole',
  partyName: 'partyName|PartyName|PARTY_NAME|Name|OrganizationName',
};

export function parseUccCsv(text: string, columnMap?: BulkColumnMap): UccFilingBody[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const map = mergeMap(columnMap);
  return rows
    .map((row) => rowToFiling(row, map))
    .filter((f): f is UccFilingBody => Boolean(f));
}

/**
 * Join filings + parties CSVs (SCI-style). Debtor/secured party rows keyed by filing number.
 */
export function joinUccBulkFiles(input: {
  filingsCsv?: string;
  partiesCsv?: string;
  normalizedCsv?: string;
  columnMap?: BulkColumnMap;
}): UccFilingBody[] {
  if (input.normalizedCsv?.trim()) {
    return parseUccCsv(input.normalizedCsv, input.columnMap);
  }

  const map = mergeMap(input.columnMap);
  const filings = input.filingsCsv ? parseCsv(input.filingsCsv) : [];
  const parties = input.partiesCsv ? parseCsv(input.partiesCsv) : [];

  if (!filings.length && parties.length) {
    // Parties-only: synthesize filings from debtor rows
    return parties
      .map((row) => {
        const role = (pick(row, map.partyType) || '').toUpperCase();
        if (role && !/DEBTOR|DBTR|BORROWER/.test(role)) return null;
        const filingNumber = pick(row, map.filingNumber);
        const debtorName = pick(row, map.partyName) || pick(row, map.debtorName);
        if (!filingNumber || !debtorName) return null;
        return {
          filingNumber,
          filingDate: pick(row, map.filingDate) || new Date().toISOString().slice(0, 10),
          debtorName,
          debtorAddress: composeAddress(row, map),
          debtorCounty: pick(row, map.debtorCounty) || undefined,
          securedParty: undefined,
          collateral: pick(row, map.collateral) || undefined,
          action: normalizeAction(pick(row, map.action)),
        } satisfies UccFilingBody;
      })
      .filter(Boolean) as UccFilingBody[];
  }

  const partiesByFiling = new Map<string, Array<Record<string, string>>>();
  for (const p of parties) {
    const id = pick(p, map.filingNumber);
    if (!id) continue;
    const list = partiesByFiling.get(id) ?? [];
    list.push(p);
    partiesByFiling.set(id, list);
  }

  const out: UccFilingBody[] = [];
  for (const row of filings) {
    const filingNumber = pick(row, map.filingNumber);
    if (!filingNumber) continue;
    const related = partiesByFiling.get(filingNumber) ?? [];
    const debtors = related.filter((p) => /DEBTOR|DBTR|BORROWER/.test((pick(p, map.partyType) || 'DEBTOR').toUpperCase()));
    const secured = related.filter((p) =>
      /SECURED|SP|CREDITOR|LENDER/.test((pick(p, map.partyType) || '').toUpperCase()),
    );

    const debtorRows = debtors.length ? debtors : related.length ? [related[0]!] : [row];
    for (const d of debtorRows) {
      const debtorName =
        pick(d, map.partyName) || pick(d, map.debtorName) || pick(row, map.debtorName);
      if (!debtorName) continue;
      out.push({
        filingNumber: debtorRows.length > 1 ? `${filingNumber}:${debtorName.slice(0, 24)}` : filingNumber,
        filingDate: pick(row, map.filingDate) || pick(d, map.filingDate) || new Date().toISOString().slice(0, 10),
        debtorName,
        debtorAddress: composeAddress(d, map) || composeAddress(row, map) || undefined,
        debtorCounty: pick(d, map.debtorCounty) || pick(row, map.debtorCounty) || undefined,
        securedParty:
          pick(secured[0] ?? {}, map.partyName) ||
          pick(secured[0] ?? {}, map.securedParty) ||
          pick(row, map.securedParty) ||
          undefined,
        collateral: pick(row, map.collateral) || undefined,
        action: normalizeAction(pick(row, map.action)),
      });
    }
  }
  return out;
}

export function filterTargetCounties(
  filings: UccFilingBody[],
  counties: string[],
  since?: Date,
): UccFilingBody[] {
  const sinceMs = since?.getTime() ?? 0;
  return filings.filter((f) => {
    const county = (f.debtorCounty || '').toUpperCase();
    if (county && !counties.some((c) => county.includes(c))) return false;
    if (!since) return true;
    const d = new Date(f.filingDate);
    return !Number.isNaN(d.getTime()) && d.getTime() >= sinceMs;
  });
}

function rowToFiling(row: Record<string, string>, map: Required<BulkColumnMap>): UccFilingBody | null {
  const filingNumber = pick(row, map.filingNumber);
  const debtorName = pick(row, map.debtorName) || pick(row, map.partyName);
  const filingDate = pick(row, map.filingDate);
  if (!filingNumber || !debtorName || !filingDate) return null;

  const role = (pick(row, map.partyType) || '').toUpperCase();
  if (role && /SECURED|SP|CREDITOR|LENDER/.test(role) && !/DEBTOR/.test(role)) {
    return null;
  }

  return {
    filingNumber,
    filingDate: normalizeDate(filingDate),
    debtorName,
    debtorAddress: composeAddress(row, map) || undefined,
    debtorCounty: pick(row, map.debtorCounty) || undefined,
    securedParty: pick(row, map.securedParty) || undefined,
    collateral: pick(row, map.collateral) || undefined,
    action: normalizeAction(pick(row, map.action)),
  };
}

function composeAddress(row: Record<string, string>, map: Required<BulkColumnMap>): string {
  const street = pick(row, map.debtorAddress);
  const city = pick(row, map.debtorCity);
  const state = pick(row, map.debtorState);
  const zip = pick(row, map.debtorZip);
  if (street && (city || state || zip)) {
    return [street, city, state, zip].filter(Boolean).join(', ');
  }
  return street;
}

function normalizeAction(raw: string): 'filing' | 'termination' {
  const u = (raw || '').toUpperCase();
  if (/TERM|LAPSE|RELEASE|UCC-3.*TERM/.test(u) || u === '3' || u === 'T') return 'termination';
  return 'filing';
}

function normalizeDate(raw: string): string {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

function mergeMap(custom?: BulkColumnMap): Required<BulkColumnMap> {
  let fromEnv: BulkColumnMap = {};
  try {
    const raw = process.env.UCC_BULK_COLUMN_MAP?.trim();
    if (raw) fromEnv = JSON.parse(raw) as BulkColumnMap;
  } catch {
    /* ignore bad env */
  }
  const merged = { ...DEFAULT_MAP, ...fromEnv, ...custom };
  return merged as Required<BulkColumnMap>;
}

function pick(row: Record<string, string>, aliases: string): string {
  if (!row || !aliases) return '';
  const keys = Object.keys(row);
  for (const alias of aliases.split('|')) {
    const want = alias.trim().toLowerCase();
    const hit = keys.find((k) => k.trim().toLowerCase() === want);
    if (hit && row[hit]?.trim()) return row[hit]!.trim();
  }
  // loose contains match
  for (const alias of aliases.split('|')) {
    const want = alias.trim().toLowerCase();
    if (want.length < 4) continue;
    const hit = keys.find((k) => k.trim().toLowerCase().includes(want));
    if (hit && row[hit]?.trim()) return row[hit]!.trim();
  }
  return '';
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const delim = detectDelim(text);
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]!, delim);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!, delim);
    if (!cols.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function detectDelim(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const commas = (first.match(/,/g) || []).length;
  const tildes = (first.match(/~/g) || []).length;
  const pipes = (first.match(/\|/g) || []).length;
  if (tildes > commas && tildes >= pipes) return '~';
  if (pipes > commas) return '|';
  return ',';
}

function splitCsvLine(line: string, delim = ','): string[] {
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
    if (ch === delim && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}
