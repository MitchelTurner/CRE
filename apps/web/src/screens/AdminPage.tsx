import { useEffect, useMemo, useState } from 'react';
import {
  enqueueEnrich,
  enqueueQuarterlyReport,
  enqueueSync,
  getInventory,
  listSyncRuns,
  previewDigest,
  reactivateParcels,
  sendDigest,
  syncCrm,
  syncEvents,
  tuneWeights,
} from '../lib/api';
import type { DigestPreview, SyncRun } from '../lib/types';
import { formatDate } from '../lib/format';
import { useToast } from '../state/toast';

export function AdminPage() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [inventory, setInventory] = useState<{
    total: number;
    activeCommercial: number;
    inactiveCommercial: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { push } = useToast();

  async function refreshRuns() {
    const [data, inv] = await Promise.all([listSyncRuns(), getInventory()]);
    setRuns(data);
    setInventory(inv);
  }

  useEffect(() => {
    void refreshRuns().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to load sync runs');
    });
  }, []);

  const allPins = useMemo(() => preview?.leads.map((l) => l.pin) ?? [], [preview]);
  const excludePins = useMemo(() => [...excluded], [excluded]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      const note =
        result &&
        typeof result === 'object' &&
        'note' in result &&
        typeof (result as { note?: unknown }).note === 'string'
          ? (result as { note: string }).note
          : null;
      const msg = note ?? `${label} done`;
      setMessage(msg);
      push(msg, 'success');
      try {
        await refreshRuns();
      } catch (refreshErr) {
        setError(
          refreshErr instanceof Error
            ? `Job was queued, but reading history failed: ${refreshErr.message}`
            : 'Job was queued, but reading history failed',
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${label} failed`;
      setError(msg);
      push(msg, 'danger');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="animate-fade">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">Admin</h2>
        <p className="text-fog mt-1 max-w-xl text-sm">
          Sync, enrich, tune, CRM, and curate digest include/exclude before send.
        </p>
      </div>

      {inventory ? (
        <p className="text-fog mb-4 text-sm">
          Inventory: {inventory.activeCommercial.toLocaleString()} active commercial
          {inventory.inactiveCommercial > 0
            ? ` · ${inventory.inactiveCommercial.toLocaleString()} inactive (soft-deleted)`
            : ''}
          {inventory.total === 0 ? ' · empty — run a full sync' : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('Sync', () => enqueueSync())}
          className="bg-moss text-ink hover:bg-moss-dim px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Sync' ? 'Enqueueing…' : 'Run full sync'}
        </button>
        {(inventory?.inactiveCommercial ?? 0) > 0 || (inventory?.activeCommercial ?? 0) === 0 ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run('Reactivate', () => reactivateParcels())}
            className="border-brass/60 text-brass hover:bg-brass/10 border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'Reactivate' ? 'Restoring…' : 'Restore inactive parcels'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('Enrich', () => enqueueEnrich(25))}
          className="border-pine-soft text-mist hover:border-moss border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Enrich' ? 'Enqueueing…' : 'Run enrichment'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('Events sync', () => syncEvents())}
          className="border-pine-soft text-mist hover:border-moss border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Events sync' ? 'Enqueueing…' : 'Sync events'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('Quarterly report', () => enqueueQuarterlyReport())}
          className="border-pine-soft text-mist hover:border-moss border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Quarterly report' ? 'Enqueueing…' : 'Quarterly report'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('Tune weights', async () => {
              const res = await tuneWeights();
              setMessage(
                `Tuned from ${res.samples} downvotes` +
                  (Object.keys(res.adjusted).length
                    ? `: ${JSON.stringify(res.adjusted)}`
                    : ' (no change)'),
              );
            })
          }
          className="border-pine-soft text-mist hover:border-moss border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Tune weights' ? 'Tuning…' : 'Tune weights'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('CRM sync', async () => {
              const res = await syncCrm();
              setMessage(`CRM sync: ${res.synced} synced, ${res.skipped} skipped`);
            })
          }
          className="border-pine-soft text-mist hover:border-moss border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'CRM sync' ? 'Syncing…' : 'CRM sync'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('Digest preview', async () => {
              const data = await previewDigest([]);
              setPreview(data);
              setExcluded(new Set());
            })
          }
          className="border-pine-soft text-mist hover:border-moss border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Digest preview' ? 'Rendering…' : 'Preview digest'}
        </button>
        <button
          type="button"
          disabled={!!busy || !preview}
          onClick={() => void run('Digest send', () => sendDigest(excludePins))}
          className="border-brass/60 text-brass hover:bg-brass/10 border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Digest send'
            ? 'Enqueueing…'
            : `Send digest (${Math.max(0, allPins.length - excluded.size)} included)`}
        </button>
      </div>

      {message ? <p className="text-moss mt-4 text-sm">{message}</p> : null}
      {error ? <p className="text-danger mt-4 text-sm">{error}</p> : null}

      {runs.some((r) => r.status === 'running') ? (
        <p className="text-brass mt-4 text-sm">
          Job running: {runs.find((r) => r.status === 'running')?.source} —{' '}
          {runs.find((r) => r.status === 'running')?.recordsSeen ?? 0} seen
        </p>
      ) : null}

      <section className="mt-10">
        <h3 className="font-display text-xl font-bold text-white">Recent sync runs</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-fog text-xs tracking-[0.16em] uppercase">
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Seen</th>
                <th className="pb-2 font-medium">Upserted</th>
                <th className="pb-2 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-pine/30 border-t">
                  <td className="py-2.5 text-white">{run.source}</td>
                  <td className="py-2.5">
                    <span
                      className={
                        run.status === 'success'
                          ? 'text-moss'
                          : run.status === 'failed'
                            ? 'text-danger'
                            : 'text-brass'
                      }
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="text-fog py-2.5">{run.recordsSeen}</td>
                  <td className="text-fog py-2.5">{run.recordsUpserted}</td>
                  <td className="text-fog py-2.5">{formatDate(run.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview ? (
        <section className="mt-10 space-y-6">
          <div>
            <h3 className="font-display text-xl font-bold text-white">Digest preview</h3>
            <p className="text-fog mt-1 text-sm">{preview.subject}</p>
            <p className="text-fog mt-1 text-xs">
              Uncheck rows to exclude them from send. {excluded.size} excluded.
            </p>
          </div>
          <ul className="space-y-3">
            {preview.leads.map((lead) => {
              const on = !excluded.has(lead.pin);
              return (
                <li key={lead.pin} className="border-pine/40 flex gap-3 border-b pb-3">
                  <input
                    type="checkbox"
                    checked={on}
                    className="accent-moss mt-1"
                    onChange={() => {
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        if (next.has(lead.pin)) next.delete(lead.pin);
                        else next.add(lead.pin);
                        return next;
                      });
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={['font-semibold', on ? 'text-white' : 'text-fog line-through'].join(' ')}>
                        {lead.rank}. {lead.situsAddress}
                        {lead.hot ? (
                          <span className="text-brass ml-2 text-xs uppercase">Hot</span>
                        ) : null}
                      </p>
                      <span className="text-moss text-sm font-bold">{lead.score}</span>
                    </div>
                    <p className="text-fog mt-1 text-sm">{lead.whyNow}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
