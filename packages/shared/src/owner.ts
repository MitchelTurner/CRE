const ENTITY_RE =
  /\b(LLC|L\.?L\.?C\.?|LP|L\.?P\.?|LTD|INC|INCORPORATED|CORP|CORPORATION|TRUST|PARTNERS|PARTNERSHIP|CO|COMPANY|HOLDINGS|PROPERTIES|ASSOC|ASSOCIATION)\b/i;

export function normalizeOwnerName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function combineOwnerNames(name1: string | null | undefined, name2: string | null | undefined): string {
  return [name1, name2]
    .map((n) => (n ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function isEntityOwner(name: string): boolean {
  return ENTITY_RE.test(name);
}