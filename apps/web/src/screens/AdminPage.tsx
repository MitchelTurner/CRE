import { useEffect, useState } from 'react';
import {
  enqueueSync,
  listSyncRuns,
  previewDigest,
  sendDigest,
} from '../lib/api';
import type { DigestPreview, SyncRun } from '../lib/types';
import { formatDate } from '../lib/format';

export function AdminPage() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refreshRuns() {
    const data = await listSyncRuns();
    setRuns(data);
  }

  useEffect(() => {
    void refreshRuns().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to load sync runs');
    });
  }, []);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(`${label} succeeded`);
      await refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="animate-fade">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">Admin</h2>
        <p className="text-fog mt-1 max-w-xl text-sm">
          Trigger ingestion, inspect sync history, and preview or send the weekly digest.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('Sync', () => enqueueSync())}
          className="bg-moss text-ink hover:bg-moss-dim px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Sync' ? 'Enqueueing…' : 'Run full sync'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('Digest preview', async () => {
              const data = await previewDigest();
              setPreview(data);
            })
          }
          className="border-pine-soft text-mist hover:border-moss border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Digest preview' ? 'Rendering…' : 'Preview digest'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run('Digest send', () => sendDigest())}
          className="border-brass/60 text-brass hover:bg-brass/10 border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'Digest send' ? 'Enqueueing…' : 'Send digest now'}
        </button>
      </div>

      {message ? <p className="text-moss mt-4 text-sm">{message}</p> : null}
      {error ? <p className="text-danger mt-4 text-sm">{error}</p> : null}

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
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-fog py-8 text-center">
                    No sync runs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {preview ? (
        <section className="mt-10">
          <h3 className="font-display text-xl font-bold text-white">Digest preview</h3>
          <p className="text-fog mt-1 text-sm">{preview.subject}</p>
          <ol className="mt-4 space-y-3">
            {preview.leads.map((lead) => (
              <li key={lead.pin} className="border-pine/40 border-b pb-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-white">
                    {lead.rank}. {lead.situsAddress}
                  </p>
                  <span className="text-moss text-sm font-bold">{lead.score}</span>
                </div>
                <p className="text-fog mt-1 text-sm">{lead.whyNow}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}