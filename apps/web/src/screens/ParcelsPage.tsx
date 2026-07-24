import { useEffect, useState, startTransition } from 'react';
import { Link } from 'react-router-dom';
import { listParcels } from '../lib/api';
import type { ParcelListItem } from '../lib/types';
import { formatDate, yearsHeld } from '../lib/format';
import { ScoreBar } from '../components/ScoreBar';

export function ParcelsPage() {
  const [items, setItems] = useState<ParcelListItem[]>([]);
  const [minScore, setMinScore] = useState(40);
  const [landUse, setLandUse] = useState('');
  const [absenteeOnly, setAbsenteeOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listParcels({
      minScore,
      landUse: landUse || undefined,
      absentee: absenteeOnly ? true : undefined,
      limit: 75,
    })
      .then((res) => {
        if (!cancelled) startTransition(() => setItems(res.items));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load parcels');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [minScore, landUse, absenteeOnly]);

  return (
    <div className="animate-fade">
      <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Parcels</h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Active commercial parcels ranked by sell-likelihood. Open a row for score components and
            pipeline status.
          </p>
        </div>
        <p className="text-fog text-sm">{loading ? 'Loading…' : `${items.length} shown`}</p>
      </div>

      <div className="border-pine/40 mb-6 flex flex-wrap items-end gap-4 border-b pb-5">
        <label className="flex flex-col gap-1 text-xs tracking-wide text-fog uppercase">
          Min score
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            className="border-pine-soft/60 bg-ink-2 focus:border-moss h-10 w-28 border px-3 text-mist outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs tracking-wide text-fog uppercase">
          Land use code
          <input
            type="text"
            value={landUse}
            onChange={(e) => setLandUse(e.target.value.trim())}
            placeholder="e.g. 940"
            className="border-pine-soft/60 bg-ink-2 focus:border-moss h-10 w-36 border px-3 text-mist outline-none"
          />
        </label>
        <label className="text-fog flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={absenteeOnly}
            onChange={(e) => setAbsenteeOnly(e.target.checked)}
            className="accent-moss"
          />
          Absentee only
        </label>
      </div>

      {error ? <p className="text-danger mb-4 text-sm">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="text-fog text-xs tracking-[0.16em] uppercase">
              <th className="pb-3 font-medium">Score</th>
              <th className="pb-3 font-medium">Address</th>
              <th className="pb-3 font-medium">Owner</th>
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Hold</th>
              <th className="pb-3 font-medium">PIN</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-pine/30 border-t transition hover:bg-white/3">
                <td className="py-3 pr-4 align-middle">
                  <ScoreBar score={row.score} />
                </td>
                <td className="py-3 pr-4 align-middle">
                  <Link
                    to={`/parcels/${encodeURIComponent(row.pin)}`}
                    className="font-semibold text-white hover:text-moss"
                  >
                    {row.situsAddress || '(no situs)'}
                  </Link>
                  {row.isAbsentee ? (
                    <span className="text-brass mt-1 block text-xs tracking-wide">Absentee</span>
                  ) : null}
                </td>
                <td className="text-fog py-3 pr-4 align-middle">{row.ownerName || '—'}</td>
                <td className="text-fog py-3 pr-4 align-middle">
                  {row.propType || row.landUseCode || '—'}
                </td>
                <td className="text-fog py-3 pr-4 align-middle">
                  {yearsHeld(row.deedDate)}y
                  <span className="mt-0.5 block text-xs opacity-70">{formatDate(row.deedDate)}</span>
                </td>
                <td className="py-3 align-middle font-mono text-xs text-fog">{row.pin}</td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-fog py-12 text-center">
                  No parcels match these filters. Run a sync from Admin if the database is empty.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}