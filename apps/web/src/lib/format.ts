export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function yearsHeld(deedDate: string | null | undefined): string {
  if (!deedDate) return 'unknown';
  const years = (Date.now() - new Date(deedDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0) return '0';
  return years.toFixed(1);
}

export const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  sent: 'Sent',
  contacted: 'Contacted',
  dead: 'Dead',
  deal: 'Deal',
};