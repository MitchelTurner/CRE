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
};

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
