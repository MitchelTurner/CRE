import { useEffect, useMemo, useState, startTransition } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listParcels } from '../lib/api';
import type { ParcelListItem, ScoreComponents } from '../lib/types';
import { yearsHeld } from '../lib/format';
import { shortWhyNow } from '../lib/signals';
import { ScoreBar } from '../components/ScoreBar';
import { SignalChips } from '../components/SignalChips';
import { ScoreExplain } from '../components/ScoreExplain';
import { EmptyState } from '../components/EmptyState';
import { downloadDriveListCsv, saveDriveList } from '../lib/driveList';
import { useToast } from '../state/toast';

type SavedView = 'all' | 'hot' | 'absentee70' | 'missingPhone' | 'industrial';

const VIEWS: Array<{ id: SavedView; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'hot', label: 'Hot this week' },
  { id: 'absentee70', label: 'Absentee ≥70' },
  { id: 'missingPhone', label: 'Missing phone' },
  { id: 'industrial', label: 'Industrial' },
];

export function ParcelsPage() {
  const [params, setParams] = useSearchParams();
  const initialView = (params.get('view') as SavedView) || 'all';
  const [view, setView] = useState<SavedView>(
    VIEWS.some((v) => v.id === initialView) ? initialView : 'all',
  );
  const [items, setItems] = useState<ParcelListItem[]>([]);
  const [minScore, setMinScore] = useState(view === 'absentee70' ? 70 : 0);
  const [landUse, setLandUse] = useState('');
  const [absenteeOnly, setAbsenteeOnly] = useState(view === 'absentee70');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [explain, setExplain] = useState<{
    score: number | null;
    components: ScoreComponents | null;
  } | null>(null);
  const { push } = useToast();

  const query = useMemo(() => {
    const hotOnly = view === 'hot';
    const missingContact = view === 'missingPhone';
    return {
      minScore: view === 'absentee70' ? Math.max(minScore, 70) : minScore,
      landUse: view === 'industrial' ? landUse || undefined : landUse || undefined,
      absentee: view === 'absentee70' || absenteeOnly ? true : undefined,
      hotOnly: hotOnly || undefined,
      missingContact: missingContact || undefined,
      limit: 75,
    };
  }, [view, minScore, landUse, absenteeOnly]);

  useEffect(() => {
    if (view === 'absentee70') {
      setAbsenteeOnly(true);
      setMinScore((s) => Math.max(s, 70));
    }
    setParams(view === 'all' ? {} : { view }, { replace: true });
  }, [view, setParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listParcels(query)
      .then((res) => {
        if (!cancelled) {
          let rows = res.items;
          if (view === 'industrial') {
            rows = rows.filter(
              (r) =>
                (r.propType || '').toUpperCase().includes('INDUSTRIAL') ||
                r.landUseCode === '940' ||
                r.landUseCode === '930',
            );
          }
          startTransition(() => setItems(rows));
        }
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
  }, [query, view]);

  return (
    <div className="animate-fade">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Parcels</h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Why-now and catalysts first. Tap a score for the breakdown.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="border-pine-soft text-mist hover:border-moss border px-3 py-1.5 text-sm font-semibold"
            onClick={() => {
              const drive = items.slice(0, 20).map((i) => ({
                pin: i.pin,
                situsAddress: i.situsAddress,
                ownerName: i.ownerName,
                score: i.score,
                whyNow: i.whyNow ?? null,
                phone: null,
              }));
              saveDriveList(drive);
              downloadDriveListCsv(drive);
              push('Top 20 saved as drive list', 'success');
            }}
          >
            Drive list
          </button>
          <p className="text-fog text-sm">{loading ? 'Loading…' : `${items.length} shown`}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={[
              'px-3 py-1.5 text-sm font-semibold tracking-wide',
              view === v.id ? 'bg-moss text-ink' : 'text-fog hover:text-mist',
            ].join(' ')}
          >
            {v.label}
          </button>
        ))}
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

      {!loading && items.length === 0 ? (
        <EmptyState
          title="No parcels match"
          body="Widen filters, or run a full sync if inventory is empty."
          actionTo="/admin"
          actionLabel="Open Admin"
        />
      ) : (
        <ul className="divide-pine/40 divide-y md:hidden">
          {items.map((row) => (
            <li key={row.id} className="py-4">
              <button
                type="button"
                className="mb-2"
                onClick={() =>
                  setExplain({ score: row.score, components: row.components })
                }
              >
                <ScoreBar score={row.score} />
              </button>
              <p className="text-sm text-mist/90">{shortWhyNow(row.whyNow, 140) || 'No why-now yet'}</p>
              <SignalChips types={row.signalTypes} />
              <Link
                to={`/parcels/${encodeURIComponent(row.pin)}`}
                className="font-display mt-2 block text-xl font-bold text-white hover:text-moss"
              >
                {row.situsAddress || row.pin}
              </Link>
              <p className="text-fog mt-1 text-xs">
                {row.ownerName || '—'} · {yearsHeld(row.deedDate)}y hold
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="text-fog text-xs tracking-[0.16em] uppercase">
              <th className="pb-3 font-medium">Score</th>
              <th className="pb-3 font-medium">Why now</th>
              <th className="pb-3 font-medium">Address</th>
              <th className="pb-3 font-medium">Owner</th>
              <th className="pb-3 font-medium">Hold</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-pine/30 border-t transition hover:bg-white/3">
                <td className="py-3 pr-4 align-top">
                  <button
                    type="button"
                    onClick={() =>
                      setExplain({ score: row.score, components: row.components })
                    }
                    className="text-left"
                    title="Explain score"
                  >
                    <ScoreBar score={row.score} />
                  </button>
                </td>
                <td className="py-3 pr-4 align-top">
                  <p className="text-mist max-w-xs text-sm">
                    {shortWhyNow(row.whyNow, 110) || '—'}
                  </p>
                  <SignalChips types={row.signalTypes} />
                </td>
                <td className="py-3 pr-4 align-top">
                  <Link
                    to={`/parcels/${encodeURIComponent(row.pin)}`}
                    className="font-semibold text-white hover:text-moss"
                  >
                    {row.situsAddress || '(no situs)'}
                  </Link>
                  <span className="text-fog mt-1 block font-mono text-xs">{row.pin}</span>
                </td>
                <td className="text-fog py-3 pr-4 align-top">
                  {row.ownerName || '—'}
                  {row.isAbsentee ? (
                    <span className="text-brass mt-1 block text-xs">Absentee</span>
                  ) : null}
                </td>
                <td className="text-fog py-3 align-top">{yearsHeld(row.deedDate)}y</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ScoreExplain
        open={!!explain}
        score={explain?.score ?? null}
        components={explain?.components ?? null}
        onClose={() => setExplain(null)}
      />
    </div>
  );
}
