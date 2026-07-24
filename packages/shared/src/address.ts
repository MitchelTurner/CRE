export function normalizeAddress(address: string | null | undefined): string {
  if (!address) return '';
  return address
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(STREET|STR)\b/g, 'ST')
    .replace(/\b(AVENUE|AVE)\b/g, 'AVE')
    .replace(/\b(BOULEVARD|BLVD)\b/g, 'BLVD')
    .replace(/\b(DRIVE|DR)\b/g, 'DR')
    .replace(/\b(ROAD|RD)\b/g, 'RD')
    .replace(/\b(LANE|LN)\b/g, 'LN')
    .replace(/\b(COURT|CT)\b/g, 'CT')
    .replace(/\b(PLACE|PL)\b/g, 'PL')
    .replace(/\b(HIGHWAY|HWY)\b/g, 'HWY')
    .replace(/\b(SUITE|STE|UNIT|APT|APARTMENT)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSitusAddress(
  number: string | null | undefined,
  street: string | null | undefined,
): string | null {
  const parts = [number, street]
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

export function buildMailingAddress(
  street: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string | null {
  const line1 = (street ?? '').trim();
  const line2 = [city, state, zip]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const full = [line1, line2].filter(Boolean).join(', ');
  return full || null;
}

/**
 * Absentee when mailing street exists and does not match situs after normalization.
 * PO boxes and out-of-state mailings almost always count as absentee.
 */
export function isAbsenteeOwner(input: {
  mailingStreet: string | null | undefined;
  situsAddress: string | null | undefined;
  mailingState?: string | null | undefined;
  homeState?: string;
}): boolean {
  const mailing = normalizeAddress(input.mailingStreet);
  if (!mailing) return false;

  if (/^(PO|P O)\s*BOX\b/.test(mailing)) return true;

  const situs = normalizeAddress(input.situsAddress);
  if (!situs) return Boolean(input.mailingStreet?.trim());

  if (mailing !== situs && !mailing.includes(situs) && !situs.includes(mailing)) {
    return true;
  }

  const home = (input.homeState ?? 'SC').toUpperCase();
  const state = (input.mailingState ?? '').trim().toUpperCase();
  if (state && state !== home) return true;

  return false;
}

export function isOutOfState(
  mailingState: string | null | undefined,
  homeState = 'SC',
): boolean {
  const state = (mailingState ?? '').trim().toUpperCase();
  if (!state) return false;
  return state !== homeState.toUpperCase();
}