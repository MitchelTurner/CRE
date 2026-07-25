import { SIGNAL_LABELS } from '../lib/signals';

export function SignalChips({ types, max = 4 }: { types?: string[]; max?: number }) {
  if (!types?.length) return null;
  const shown = types.slice(0, max);
  const extra = types.length - shown.length;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {shown.map((t) => (
        <span
          key={t}
          className="border-brass/30 bg-brass/10 text-brass px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
        >
          {SIGNAL_LABELS[t] || t}
        </span>
      ))}
      {extra > 0 ? <span className="text-fog text-[10px]">+{extra}</span> : null}
    </div>
  );
}
