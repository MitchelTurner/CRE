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

/** Event-friendly datetime + relative cue (Today / Tomorrow / In 3 days). */
export function formatEventWhen(value: string | null | undefined): {
  absolute: string;
  relative: string;
  isPast: boolean;
  isSoon: boolean;
} {
  if (!value) return { absolute: '—', relative: '', isPast: false, isSoon: false };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { absolute: '—', relative: '', isPast: false, isSoon: false };
  }

  const absolute = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startEvent = new Date(d);
  startEvent.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startEvent.getTime() - startToday.getTime()) / (24 * 60 * 60 * 1000),
  );
  const isPast = d.getTime() < now.getTime();

  let relative = '';
  if (dayDiff === 0) relative = isPast ? 'Earlier today' : 'Today';
  else if (dayDiff === 1) relative = 'Tomorrow';
  else if (dayDiff === -1) relative = 'Yesterday';
  else if (dayDiff > 1 && dayDiff <= 14) relative = `In ${dayDiff} days`;
  else if (dayDiff < -1 && dayDiff >= -14) relative = `${Math.abs(dayDiff)} days ago`;

  return {
    absolute,
    relative,
    isPast,
    isSoon: !isPast && dayDiff >= 0 && dayDiff <= 7,
  };
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
  invited: 'Invited',
  attended_event: 'Attended event',
};