import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createYardObservation,
  getIndustrialCoverage,
  getReferralAttribution,
  getSignalMovers,
  getSignalSources,
  getUccStatus,
  ingestSignalRecords,
  ingestUccCsv,
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
  const [referrals, setReferrals] = useState<{
    totalReferrals: number;
    uniqueSources: number;
    sources: Array<{
      referralSource: string;
      count: number;
      companies: Array<{ companyName: string; bandLabel: string | null; headline: string }>;
    }>;
  } | null>(null);
  const [coverage, setCoverage] = useState<{
    pct: number;
    totalEligible: number;
    totalWithVerifiedClear: number;
    bySubmarket: Array<{
      submarket: string;
      eligible: number;
      withVerifiedClear: number;
      pct: number;
      missingPins: string[];
    }>;
  } | null>(null);
  const [pasteKey, setPasteKey] = useState('ucc');
  const [pasteJson, setPasteJson] = useState('');
  const [manual, setManual] = useState({
    companyName: '',
    type: 'REFERRAL',
    headline: '',
    referralSource: '',
    siteAddress: '',
  });
  const [yard, setYard] = useState({
    pin: '',
    companyName: '',
    siteAddress: '',
    flightDate: new Date().toISOString().slice(0, 10),
    yardCoveragePct: '',
    trailerCount: '',
    containerCount: '',
    yardAcres: '',
  });
  const [yardPreview, setYardPreview] = useState<string | null>(null);
  const [uccStatus, setUccStatus] = useState<{
    ready: boolean;
    mode: string;
    note: string;
    signupUrl: string;
  } | null>(null);
  const [uccCsv, setUccCsv] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const [s, m, q, r, c, u] = await Promise.all([
      getSignalSources(),
      getSignalMovers(),
      listResolutionQueue('pending'),
      getReferralAttribution(365),
      getIndustrialCoverage(),
      getUccStatus(),
    ]);
    setSources(s);
    setMovers(m);
    setQueue(q);
    setReferrals(r);
    setCoverage(c);
    setUccStatus(u);
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
          Occupier space-change intelligence (UCC, FMCSA, ECHO, SBA, aerial, imports, hiring) —
          orthogonal to parcel sell scores. Paste feed JSON or enqueue connectors; resolution queue
          catches fuzzy matches.
        </p>
        <p className="mt-2 text-xs">
          <Link to="/requirements" className="text-moss font-semibold">
            Requirements & canvass →
          </Link>
        </p>
      </div>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">
          Clear-height coverage (moat KPI)
        </h3>
        <p className="text-fog mt-1 text-xs">
          % of industrial parcels ≥20k SF with verified clear height
          {coverage
            ? ` — ${coverage.pct}% (${coverage.totalWithVerifiedClear}/${coverage.totalEligible})`
            : ''}
        </p>
        <div className="mt-3 space-y-2">
          {!coverage || coverage.bySubmarket.length === 0 ? (
            <p className="text-fog text-xs">
              Capture clear height on parcel pages to start the coverage moat.
            </p>
          ) : (
            coverage.bySubmarket.slice(0, 8).map((b) => (
              <div key={b.submarket} className="border-pine-soft flex justify-between border-b pb-1 text-xs last:border-0">
                <span className="text-mist">{b.submarket}</span>
                <span className="text-fog">
                  {b.withVerifiedClear}/{b.eligible} · {b.pct}%
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">Connectors</h3>
        {uccStatus ? (
          <p className={`mt-1 text-xs ${uccStatus.ready ? 'text-moss' : 'text-amber-300/90'}`}>
            UCC: {uccStatus.mode} — {uccStatus.note}{' '}
            {!uccStatus.ready ? (
              <a
                href={uccStatus.signupUrl}
                target="_blank"
                rel="noreferrer"
                className="text-moss font-semibold"
              >
                SCI bulk signup →
              </a>
            ) : null}
          </p>
        ) : null}
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
        <h3 className="text-sm font-semibold text-white">UCC CSV ingest</h3>
        <p className="text-fog mt-1 text-xs">
          Paste normalized SCI monthly CSV (or fixture ucc-bulk-normalized.csv). Interactive SOS
          search is CAPTCHA-gated — use bulk subscription or paste, never scrape.
        </p>
        <textarea
          value={uccCsv}
          onChange={(e) => setUccCsv(e.target.value)}
          rows={6}
          placeholder="filingNumber,filingDate,debtorName,debtorAddress,debtorCounty,securedParty,collateral,action"
          className="border-pine-soft bg-ink text-mist mt-3 w-full rounded border px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          disabled={!!busy || !uccCsv.trim()}
          className="btn-primary mt-3 !text-xs disabled:opacity-50"
          onClick={() =>
            void run('UCC CSV', () => ingestUccCsv({ csv: uccCsv, sinceDays: 365 }))
          }
        >
          Ingest UCC CSV
        </button>
      </section>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">Aerial yard observation</h3>
        <p className="text-fog mt-1 text-xs">
          Manual/assisted counts — overflow needs &gt;85% on two flights; contraction is a drop from
          &gt;60% to &lt;20%. Generates an annotated SVG for in-person delivery.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="PIN (optional)"
            value={yard.pin}
            onChange={(e) => setYard((y) => ({ ...y, pin: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Flight date"
            type="date"
            value={yard.flightDate}
            onChange={(e) => setYard((y) => ({ ...y, flightDate: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Company name"
            value={yard.companyName}
            onChange={(e) => setYard((y) => ({ ...y, companyName: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Site address"
            value={yard.siteAddress}
            onChange={(e) => setYard((y) => ({ ...y, siteAddress: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Yard coverage %"
            value={yard.yardCoveragePct}
            onChange={(e) => setYard((y) => ({ ...y, yardCoveragePct: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Trailer count"
            value={yard.trailerCount}
            onChange={(e) => setYard((y) => ({ ...y, trailerCount: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Container count"
            value={yard.containerCount}
            onChange={(e) => setYard((y) => ({ ...y, containerCount: e.target.value }))}
          />
          <input
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
            placeholder="Yard acres (optional)"
            value={yard.yardAcres}
            onChange={(e) => setYard((y) => ({ ...y, yardAcres: e.target.value }))}
          />
        </div>
        <button
          type="button"
          disabled={!!busy || !yard.yardCoveragePct || (!yard.companyName && !yard.pin)}
          className="btn-primary mt-3 !text-xs disabled:opacity-50"
          onClick={() =>
            void run('Yard observation', async () => {
              const result = await createYardObservation({
                pin: yard.pin || undefined,
                companyName: yard.companyName || undefined,
                siteAddress: yard.siteAddress || undefined,
                flightDate: yard.flightDate,
                yardCoveragePct: Number(yard.yardCoveragePct),
                trailerCount: yard.trailerCount ? Number(yard.trailerCount) : null,
                containerCount: yard.containerCount ? Number(yard.containerCount) : null,
                yardAcres: yard.yardAcres ? Number(yard.yardAcres) : null,
              });
              setYardPreview(result.annotatedImageRef);
              return result;
            })
          }
        >
          Save observation
        </button>
        {yardPreview ? (
          <img
            src={yardPreview}
            alt="Annotated yard card"
            className="border-pine-soft mt-3 max-w-full rounded border"
          />
        ) : null}
      </section>

      <section className="event-card">
        <h3 className="text-sm font-semibold text-white">Paste feed JSON</h3>
        <p className="text-fog mt-1 text-xs">
          UCC / FMCSA / ECHO / SBA / aerial / imports / hiring arrays (see
          apps/api/test/fixtures/signals). Lands in signal_raw then normalizes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={pasteKey}
            onChange={(e) => setPasteKey(e.target.value)}
            className="border-pine-soft bg-ink text-mist rounded border px-3 py-2 text-sm"
          >
            <option value="ucc">ucc</option>
            <option value="fmcsa">fmcsa</option>
            <option value="echo">echo</option>
            <option value="sba">sba</option>
            <option value="aerial">aerial</option>
            <option value="imports">imports</option>
            <option value="hiring">hiring</option>
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
                  let sourceRef = `row-${i}`;
                  if (row.filingNumber) sourceRef = String(row.filingNumber);
                  else if (row.dotNumber && row.snapshotMonth) {
                    sourceRef = `${row.dotNumber}:${row.snapshotMonth}`;
                  } else if (row.loanNumber) sourceRef = String(row.loanNumber);
                  else if (row.eventKind && row.facilityName) {
                    sourceRef = `echo:${row.eventKind}:${row.registryId || row.facilityName}`;
                  } else if (row.borrowerName && row.approvalDate) {
                    sourceRef = `sba:${row.program}:${row.borrowerName}:${row.approvalDate}`;
                  } else if (row.eventKind && row.companyName && row.yardCoveragePct != null) {
                    sourceRef = `aerial:${row.eventKind}:${row.companyName}:${String(row.flightDate).slice(0, 10)}`;
                  } else if (row.consigneeName && row.period) {
                    sourceRef = `imports:${row.consigneeName}:${row.period}`;
                  } else if (row.companyName && row.title && row.postedAt) {
                    sourceRef = `hiring:${row.companyName}:${row.postedAt}:${i}`;
                  }
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
        <h3 className="text-sm font-semibold text-white">Referral attribution (12 mo)</h3>
        <p className="text-fog mt-1 text-xs">
          {referrals
            ? `${referrals.totalReferrals} referrals · ${referrals.uniqueSources} sources`
            : 'Loading…'}
        </p>
        <div className="mt-3 space-y-3">
          {!referrals || referrals.sources.length === 0 ? (
            <p className="text-fog text-xs">
              No referrals yet — log a REFERRAL with a source name above.
            </p>
          ) : (
            referrals.sources.map((s) => (
              <div key={s.referralSource} className="border-pine-soft border-b pb-2 last:border-0">
                <p className="text-sm font-semibold text-white">
                  {s.referralSource}{' '}
                  <span className="text-fog font-normal">({s.count})</span>
                </p>
                <p className="text-mist mt-1 text-xs">
                  {s.companies
                    .slice(0, 3)
                    .map((c) => `${c.companyName}${c.bandLabel ? ` · ${c.bandLabel}` : ''}`)
                    .join(' · ')}
                  {s.companies.length > 3 ? ` · +${s.companies.length - 3} more` : ''}
                </p>
              </div>
            ))
          )}
        </div>
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
