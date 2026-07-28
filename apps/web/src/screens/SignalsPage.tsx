import { useEffect, useState } from 'react';
import {
  getSignalMovers,
  getSignalSources,
  ingestSignalRecords,
  listResolutionQueue,
  resolveResolutionItem,
  runSignalSource,
  submitManualSignal,
} from '../lib/api';
import { useToast } from '../state/toast';

export function SignalsPage() {
  const { push } = useToast();
  const [sources, setSources] = useState<Array<{ key: string; cadence: string; tier: number }>>(
    [],
  );
  const [movers, setMovers] = useState<
    Array<{
      companyName: string;
      score: number;
      previousScore: number | null;
      delta: number;
      bandLabel: string;
      topSignals: Array<{ headline: string }>;
    }>
  >([]);
  const [queue, setQueue] = useState<
    Array<{
      id: string;
      kind: string;
      rawName: string | null;
      rawAddress: string | null;
      candidateScore: number | null;
      status: string;
    }>
  >([]);
  const [pasteKey, setPasteKey] = useState('ucc');
  const [pasteJson, setPasteJson] = useState('');
  const [manual, setManual] = useState({
    companyName: '',
    type: 'REFERRAL',
    headline: '',
    referralSource: '',
    siteAddress: '',
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const [s, m, q] = await Promise.all([
      getSignalSources(),
      getSignalMovers(),
      listResolutionQueue('pending'),
    ]);
    setSources(s);
    setMovers(m);
    setQueue(q);
  }

  useEffect(() => {
    void refresh().catch((err: unknown) =>
      push(err instanceof Error ? err.message : 'Failed to load signals', 'danger'),
    );
  }, [push]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      const result = await fn();
      const note =
        result && typeof result === 'object' && 'note' in result
          ? String((result as { note?: string }).note ?? `${label} done`)
          : `${label} done`;
      push(note, 'success');
      await refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : `${label} failed`, 'danger');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="animate-fade space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">
          Industrial Signals
        </h2>
        <p className="text-fog mt-1 max-w-2xl text-sm">
          Occupier space-change intelligence (UCC, FMCSA, …) — orthogonal to parcel sell scores.
          Paste feed JSON or enqueue connectors; resolution queue catches fuzzy matches.
        </p>
      </div>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">Connectors</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={!!busy}
              onClick={() => void run(`Run ${s.key}`, () => runSignalSource(s.key))}
              className="btn-ghost !text-xs disabled:opacity-50"
            >
              {busy === `Run ${s.key}` ? 'Queueing…' : `${s.key} (T${s.tier})`}
            </button>
          ))}
        </div>
      </section>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">Paste feed JSON</h3>
        <p className="text-fog mt-1 text-xs">
          UCC: array of filings. FMCSA: array of census rows (see fixtures). Lands in signal_raw then
          normalizes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={pasteKey}
            onChange={(e) => setPasteKey(e.target.value)}
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
          >
            <option value="ucc">ucc</option>
            <option value="fmcsa">fmcsa</option>
          </select>
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              void run('Ingest paste', async () => {
                const parsed = JSON.parse(pasteJson) as unknown;
                if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
                const records = parsed.map((body, i) => {
                  const row = body as Record<string, unknown>;
                  const sourceRef = String(
                    row.filingNumber ||
                      (row.dotNumber && row.snapshotMonth
                        ? `${row.dotNumber}:${row.snapshotMonth}`
                        : `row-${i}`),
                  );
                  return { sourceRef, body };
                });
                return ingestSignalRecords(pasteKey, records);
              })
            }
            className="btn-primary !text-xs disabled:opacity-50"
          >
            Ingest
          </button>
        </div>
        <textarea
          value={pasteJson}
          onChange={(e) => setPasteJson(e.target.value)}
          rows={8}
          placeholder='[{"filingNumber":"UCC-1","filingDate":"2026-07-15","debtorName":"…","collateral":"racking"}]'
          className="border-pine-soft bg-ink text-mist mt-3 w-full rounded border px-3 py-2 font-mono text-xs"
        />
      </section>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">Manual signal (referral / utility)</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Company name"
            value={manual.companyName}
            onChange={(e) => setManual((m) => ({ ...m, companyName: e.target.value }))}
          />
          <select
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            value={manual.type}
            onChange={(e) => setManual((m) => ({ ...m, type: e.target.value }))}
          >
            <option value="REFERRAL">REFERRAL</option>
            <option value="UTILITY_CAPACITY">UTILITY_CAPACITY</option>
            <option value="YARD_UTILIZATION">YARD_UTILIZATION</option>
          </select>
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm md:col-span-2"
            placeholder="Headline"
            value={manual.headline}
            onChange={(e) => setManual((m) => ({ ...m, headline: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Site address (optional)"
            value={manual.siteAddress}
            onChange={(e) => setManual((m) => ({ ...m, siteAddress: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Referral source (who told you)"
            value={manual.referralSource}
            onChange={(e) => setManual((m) => ({ ...m, referralSource: e.target.value }))}
          />
        </div>
        <button
          type="button"
          disabled={!!busy || !manual.companyName || !manual.headline}
          className="btn-primary mt-3 !text-xs disabled:opacity-50"
          onClick={() =>
            void run('Manual signal', () =>
              submitManualSignal({
                companyName: manual.companyName,
                type: manual.type,
                headline: manual.headline,
                siteAddress: manual.siteAddress || undefined,
                referralSource: manual.referralSource || undefined,
              }),
            )
          }
        >
          Log signal
        </button>
      </section>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">Movers (SpaceScore Δ ≥ 20)</h3>
        <div className="mt-3 space-y-3">
          {movers.length === 0 ? (
            <p className="text-fog text-xs">No movers yet — ingest UCC/FMCSA samples.</p>
          ) : (
            movers.map((m) => (
              <div key={m.companyName} className="border-pine-soft border-b pb-2 last:border-0">
                <p className="text-sm font-semibold text-white">{m.companyName}</p>
                <p className="text-fog text-xs">
                  {m.previousScore ?? 0} → {m.score} (+{m.delta.toFixed(0)}) · {m.bandLabel}
                </p>
                <p className="text-mist mt-1 text-xs">{m.topSignals[0]?.headline}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">Resolution queue</h3>
        <div className="mt-3 space-y-3">
          {queue.length === 0 ? (
            <p className="text-fog text-xs">Queue clear.</p>
          ) : (
            queue.map((item) => (
              <div key={item.id} className="border-pine-soft flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                <div>
                  <p className="text-xs font-semibold text-white">
                    {item.kind}: {item.rawName || item.rawAddress}
                  </p>
                  <p className="text-fog text-xs">
                    candidate score {item.candidateScore?.toFixed(2) ?? '—'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary !text-xs"
                    onClick={() =>
                      void run('Confirm match', () =>
                        resolveResolutionItem(item.id, { action: 'confirm' }),
                      )
                    }
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    onClick={() =>
                      void run('Reject match', () =>
                        resolveResolutionItem(item.id, { action: 'reject' }),
                      )
                    }
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
