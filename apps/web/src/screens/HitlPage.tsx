import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listHitl, refreshHitl, updateHitl } from '../lib/api';
import type { HitlReview } from '../lib/types';

export function HitlPage() {
  const [items, setItems] = useState<HitlReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const data = await listHitl('pending');
    setItems(data);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to load HITL queue');
    });
  }, []);

  return (
    <div className="animate-fade">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">
            Enrichment review
          </h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Top leads missing SoS, ROD, skip-trace, or coordinates — clear before digest.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void refreshHitl()
              .then(() => reload())
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Refresh failed'),
              )
              .finally(() => setBusy(false));
          }}
          className="bg-moss text-ink hover:bg-moss-dim px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Refreshing…' : 'Refresh queue'}
        </button>
      </div>

      {error ? <p className="text-danger mb-4 text-sm">{error}</p> : null}

      <ul className="divide-pine/40 divide-y">
        {items.map((row) => (
          <li key={row.id} className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Link
                to={`/parcels/${encodeURIComponent(row.parcel.pin)}`}
                className="font-display text-xl font-bold text-white hover:text-moss"
              >
                {row.parcel.situsAddress || row.parcel.pin}
              </Link>
              <p className="text-fog mt-1 text-sm">
                {row.parcel.owner?.nameRaw || 'Unknown'} · score{' '}
                {row.parcel.scores[0]?.total ?? '—'}
              </p>
              <p className="text-brass mt-2 text-xs tracking-wide uppercase">
                {(Array.isArray(row.reasons) ? row.reasons : []).join(' · ')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="border-moss/50 text-moss border px-3 py-1.5 text-sm font-semibold"
                onClick={() =>
                  void updateHitl(row.id, 'done').then(() => reload())
                }
              >
                Done
              </button>
              <button
                type="button"
                className="border-pine-soft text-fog border px-3 py-1.5 text-sm"
                onClick={() =>
                  void updateHitl(row.id, 'skipped').then(() => reload())
                }
              >
                Skip
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-fog py-12 text-center text-sm">Queue clear.</li>
        ) : null}
      </ul>
    </div>
  );
}
