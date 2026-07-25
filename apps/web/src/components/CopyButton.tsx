import { useState } from 'react';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      className="border-pine-soft text-fog hover:border-moss hover:text-moss border px-2 py-1 text-xs font-semibold"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}
