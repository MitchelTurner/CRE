export const SIGNAL_LABELS: Record<string, string> = {
  tax_delinquent: 'Tax',
  tax_sale: 'Tax sale',
  mortgage_maturity: 'Maturity',
  foreclosure: 'Foreclosure',
  recent_seller: '1031',
  sos_dissolved: 'SoS out',
  sos_resolved: 'SoS',
  zoning_change: 'Zoning',
  permit_activity: 'Permit',
  nearby_listing: 'Listing',
  probate_estate: 'Probate',
  flood_zone: 'Flood',
  related_entity: 'Cluster',
  deed_comp: 'Comp',
  judgment_lien: 'Lien',
  vacancy_proxy: 'Vacancy',
};

export function formatSignalPayload(type: string, payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  const bits: string[] = [];
  if (type === 'mortgage_maturity') {
    if (p.lender || p.mortgagee) bits.push(`lender ${String(p.lender || p.mortgagee)}`);
    if (p.loanAmount || p.amount) bits.push(`loan $${Number(p.loanAmount || p.amount).toLocaleString()}`);
    if (p.inferredMaturity) bits.push(`matures ${String(p.inferredMaturity).slice(0, 10)}`);
  } else if (type === 'tax_delinquent') {
    if (p.totalTax || p.amount) bits.push(`$${Number(p.totalTax || p.amount).toLocaleString()} due`);
    if (p.yearsDelinquent) bits.push(`~${p.yearsDelinquent}y`);
    if (p.severity) bits.push(String(p.severity));
  } else if (type === 'deed_comp' || type === 'recent_seller') {
    if (p.grantee) bits.push(`buyer ${String(p.grantee)}`);
    if (p.buyerType) bits.push(String(p.buyerType));
    if (p.salePrice) bits.push(`$${Number(p.salePrice).toLocaleString()}`);
  } else if (type === 'judgment_lien') {
    if (p.kind) bits.push(String(p.kind));
    if (p.amount) bits.push(`$${Number(p.amount).toLocaleString()}`);
    if (p.caseNumber) bits.push(`#${p.caseNumber}`);
  } else if (type === 'related_entity') {
    if (p.relatedCommercialParcelCount != null) {
      bits.push(`${p.relatedCommercialParcelCount} related CRE`);
    }
  } else if (p.registeredAgent) {
    bits.push(`RA ${String(p.registeredAgent)}`);
  }
  return bits.join(' · ');
}

export const FEEDBACK_REASONS = [
  { id: 'wrong_asset', label: 'Wrong asset' },
  { id: 'wrong_owner', label: 'Wrong owner' },
  { id: 'bad_timing', label: 'Bad timing' },
  { id: 'other', label: 'Other' },
] as const;

export const OUTCOMES = [
  { id: 'connected', label: 'Connected' },
  { id: 'voicemail', label: 'VM' },
  { id: 'wrong_number', label: 'Wrong #' },
  { id: 'not_seller', label: 'Not seller' },
  { id: 'callback', label: 'Callback' },
] as const;

export function shortWhyNow(whyNow: string | null | undefined, max = 120): string {
  if (!whyNow) return '';
  const trimmed = whyNow.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
