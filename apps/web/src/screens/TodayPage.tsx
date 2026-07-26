import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTodayDashboard, enqueueSync } from '../lib/api';
import type { TodayDashboard } from '../lib/types';
import { SIGNAL_LABELS, shortWhyNow } from '../lib/signals';
import { SignalChips } from '../components/SignalChips';
import { EmptyState } from '../components/EmptyState';
import { ScoreBar } from '../components/ScoreBar';
import { AskAiPanel } from '../components/AskAiPanel';
import { useToast } from '../state/toast';
import { downloadDriveListCsv, saveDriveList } from '../lib/driveList';

export function TodayPage() {
  const [data, setData] = useState<TodayDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    let cancelled = false;
    getTodayDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load today');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error && !data) {
    return <p className="text-danger text-sm">{error}</p>;
  }

  if (!data) {
    return <p className="text-fog animate-fade text-sm">Loading today…</p>;
  }

  const needsSync = data.stats.commercialParcels === 0 || data.stats.scoredParcels === 0;

  return (
    <div className="animate-fade space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Today</h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Call queue, new catalysts, and review backlog — your daily loop in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="border-pine-soft text-mist hover:border-moss border px-3 py-2 text-sm font-semibold"
            onClick={() => {
              const items = data.callQueue.map((c) => ({
                pin: c.pin,
                situsAddress: c.situsAddress,
                ownerName: c.ownerName,
                score: c.score,
                whyNow: c.whyNow,
                phone: c.phone,
              }));
              saveDriveList(items);
              downloadDriveListCsv(items);
              push('Drive list saved + CSV downloaded', 'success');
            }}
          >
            Drive list
          </button>
          {needsSync ? (
            <button
              type="button"
              className="bg-moss text-ink hover:bg-moss-dim px-3 py-2 text-sm font-semibold"
              onClick={() =>
                void enqueueSync().then((r) => push(r.note || 'Sync enqueued', 'success'))
              }
            >
              Run sync
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="To call" value={String(data.callQueue.length)} to="/pipeline" />
        <Stat label="Review queue" value={String(data.stats.hitlPending)} to="/review" />
        <Stat label="Jobs running" value={String(data.stats.runningJobs)} to="/admin" />
        <Stat
          label="Scored parcels"
          value={String(data.stats.scoredParcels)}
          to="/parcels"
        />
      </div>

      <AskAiPanel />

      {needsSync ? (
        <EmptyState
          title="No scored inventory yet"
          body="Run a full county sync from Admin. Scoring and enrichment chain automatically after it finishes."
          actionTo="/admin"
          actionLabel="Open Admin"
        />
      ) : null}

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-xl font-bold text-white">Top to call</h3>
          <Link to="/pipeline" className="text-moss text-sm font-semibold">
            Full pipeline
          </Link>
        </div>
        <ul className="divide-pine/40 divide-y">
          {data.callQueue.map((c) => (
            <li key={c.leadId} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/parcels/${encodeURIComponent(c.pin)}`}
                  className="font-display text-lg font-bold text-white hover:text-moss"
                >
                  {c.situsAddress || c.pin}
                </Link>
                <p className="mt-1 text-sm text-mist/90">{shortWhyNow(c.whyNow, 160)}</p>
                <SignalChips types={c.signalTypes} />
                <p className="text-fog mt-2 text-xs">
                  {c.ownerName || 'Unknown'}
                  {c.phone ? ` · ${c.phone}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <ScoreBar score={c.score} />
                {c.phone ? (
                  <a
                    href={`tel:${c.phone}`}
                    className="bg-moss text-ink hover:bg-moss-dim px-3 py-2 text-sm font-semibold"
                  >
                    Call
                  </a>
                ) : (
                  <Link
                    to={`/parcels/${encodeURIComponent(c.pin)}`}
                    className="border-pine-soft text-mist border px-3 py-2 text-sm font-semibold"
                  >
                    Open
                  </Link>
                )}
              </div>
            </li>
          ))}
          {data.callQueue.length === 0 ? (
            <li className="text-fog py-8 text-sm">
              No active leads. Promote a parcel or send a digest.
            </li>
          ) : null}
        </ul>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-xl font-bold text-white">Hot catalysts</h3>
          <Link to="/parcels?view=hot" className="text-moss text-sm font-semibold">
            Hot view
          </Link>
        </div>
        <ul className="divide-pine/40 divide-y">
          {data.hotCatalysts.map((h, i) => (
            <li key={`${h.pin}-${h.signalType}-${i}`} className="flex items-center justify-between gap-3 py-3">
              <div>
                <Link
                  to={`/parcels/${encodeURIComponent(h.pin)}`}
                  className="font-semibold text-white hover:text-moss"
                >
                  {h.situsAddress || h.pin}
                </Link>
                <p className="text-brass mt-1 text-xs tracking-wide uppercase">
                  {SIGNAL_LABELS[h.signalType] || h.signalType}
                </p>
              </div>
              <ScoreBar score={h.score} />
            </li>
          ))}
          {data.hotCatalysts.length === 0 ? (
            <li className="text-fog py-8 text-sm">No new catalyst signals this week.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: string; to: string }) {
  return (
    <Link to={to} className="border-pine/40 hover:border-moss/40 border px-4 py-3 transition">
      <p className="text-fog text-xs tracking-[0.16em] uppercase">{label}</p>
      <p className="font-display mt-1 text-2xl font-bold text-white">{value}</p>
    </Link>
  );
}
