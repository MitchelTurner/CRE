import type { LeadStatus } from '../lib/types';
import { STATUS_LABELS } from '../lib/format';

const OPTIONS: LeadStatus[] = [
  'new',
  'sent',
  'contacted',
  'dead',
  'deal',
  'invited',
  'attended_event',
];

export function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: LeadStatus;
  onChange: (status: LeadStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as LeadStatus)}
      className="border-pine-soft/70 bg-ink-2 text-mist focus:border-moss min-h-9 border px-2 text-sm outline-none disabled:opacity-50"
    >
      {OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {STATUS_LABELS[opt]}
        </option>
      ))}
    </select>
  );
}