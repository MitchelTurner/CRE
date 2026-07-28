const SUFFIX_RE =
  /\b(LLC|L\.?L\.?C\.?|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LP|L\.?P\.?|LLP|PLLC|THE|HOLDINGS|PROPERTIES|ENTERPRISES|GROUP|PARTNERS|PARTNERSHIP)\b/gi;

/** Canonical company key for industrial entity resolution. */
export function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(SUFFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
