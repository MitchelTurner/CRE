import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createLead,
  getLeadNeighbors,
  getParcel,
  getParcelOutreach,
  logLeadOutcome,
  snoozeLead,
  updateLeadStatus,
} from '../lib/api';
import type { LeadOutcome, OutreachDrafts, ParcelDetail } from '../lib/types';
import { formatDate, formatMoney, yearsHeld } from '../lib/format';
import { OUTCOMES, SIGNAL_LABELS } from '../lib/signals';
import { ScoreBar } from '../components/ScoreBar';
import { StatusSelect } from '../components/StatusSelect';
import { CopyButton } from '../components/CopyButton';
import { SignalChips } from '../components/SignalChips';
import { useToast } from '../state/toast';

export function ParcelDetailPage() {
  const { pin = '' } = useParams();
  const navigate = useNavigate();
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [outreach, setOutreach] = useState<OutreachDrafts | null>(null);
  const [neighbors, setNeighbors] = useState<{
    prevPin: string | null;
    nextPin: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function reload() {
    const [data, drafts] = await Promise.all([getParcel(pin), getParcelOutreach(pin)]);
    setParcel(data);
    setOutreach(drafts);
    const leadId = data.leads[0]?.id;
    if (leadId) {
      const n = await getLeadNeighbors(leadId);
      setNeighbors({ prevPin: n.prevPin, nextPin: n.nextPin });
    } else {
      setNeighbors(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOutreach(null);
    void reload()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load parcel');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const latest = parcel?.scores[0];
  const activeLead = parcel?.leads[0];
  const contact =
    outreach?.contact ||
    parcel?.owner?.contacts?.find((c) => c.phone || c.email) ||
    null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'j' || e.key === 'J') {
        if (neighbors?.nextPin) navigate(`/parcels/${encodeURIComponent(neighbors.nextPin)}`);
      }
      if (e.key === 'k' || e.key === 'K') {
        if (neighbors?.prevPin) navigate(`/parcels/${encodeURIComponent(neighbors.prevPin)}`);
      }
      if ((e.key === 'e' || e.key === 'E') && contact?.email && outreach) {
        window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(outreach.emailSubject)}&body=${encodeURIComponent(outreach.emailBody)}`;
      }
      if ((e.key === 'c' || e.key === 'C') && contact?.phone) {
        window.location.href = `tel:${contact.phone}`;
      }
      if ((e.key === 'd' || e.key === 'D') && activeLead) {
        void updateLeadStatus(activeLead.id, 'dead').then(() => reload());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [neighbors, navigate, contact, outreach, activeLead]);

  async function onCreateLead() {
    if (!parcel) return;
    setBusy(true);
    try {
      await createLead(parcel.id);
      await reload();
      push('Added to pipeline', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create lead');
    } finally {
      setBusy(false);
    }
  }

  if (error && !parcel) {
    return (
      <div>
        <Link to="/parcels" className="text-moss text-sm">
          ← Parcels
        </Link>
        <p className="text-danger mt-6">{error}</p>
      </div>
    );
  }

  if (!parcel) {
    return <p className="text-fog animate-fade text-sm">Loading parcel…</p>;
  }

  const components = latest?.components;
  const contacts = parcel.owner?.contacts ?? [];

  return (
    <div className="animate-fade pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/parcels" className="text-fog hover:text-moss text-sm">
          ← Parcels
        </Link>
        <p className="text-fog text-xs">
          Keys: <span className="text-mist">J</span>/<span className="text-mist">K</span> next/prev
          · <span className="text-mist">C</span> call · <span className="text-mist">E</span> email ·{' '}
          <span className="text-mist">D</span> dead
        </p>
      </div>

      <div className="mt-5 grid gap-10 lg:grid-cols-[1.4fr_0.9fr]">
        <section>
          <p className="text-moss text-xs font-semibold tracking-[0.22em] uppercase">
            {parcel.propType || parcel.landUseCode || 'Commercial'}
          </p>
          <h2 className="font-display mt-2 text-4xl leading-tight font-bold tracking-tight text-white">
            {parcel.situsAddress || 'No situs address'}
          </h2>
          {activeLead ? (
            <p className="mt-3 text-sm text-mist/90">{activeLead.whyNow}</p>
          ) : null}
          <p className="text-fog mt-3 font-mono text-sm">{parcel.pin}</p>
          <SignalChips types={parcel.signals.map((s) => s.type)} max={8} />

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <Fact label="Owner" value={parcel.owner?.nameRaw || '—'} />
            <Fact
              label="Mailing"
              value={
                parcel.owner
                  ? [parcel.owner.mailingAddress, parcel.owner.mailingCity, parcel.owner.mailingState]
                      .filter(Boolean)
                      .join(', ') || '—'
                  : '—'
              }
            />
            <Fact label="Deed date" value={`${formatDate(parcel.deedDate)} (${yearsHeld(parcel.deedDate)}y)`} />
            <Fact label="Fair market value" value={formatMoney(parcel.fairMarketVal)} />
            <Fact label="Sale price" value={formatMoney(parcel.salePrice)} />
            <Fact label="Total tax" value={formatMoney(parcel.totalTax)} />
            <Fact label="Tax paid date" value={formatDate(parcel.paidDate)} />
            <Fact label="Land use" value={parcel.landUseCode || '—'} />
            <Fact
              label="Flags"
              value={[
                parcel.owner?.isAbsentee ? 'Absentee' : null,
                parcel.owner?.isEntity ? 'Entity' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Owner-occupant'}
            />
            <Fact label="SoS status" value={parcel.owner?.sosStatus || '—'} />
            <Fact label="Registered agent" value={parcel.owner?.sosRegisteredAgent || '—'} />
            <Fact label="Flood zone" value={parcel.floodZone || '—'} />
          </dl>

          {parcel.signals.length ? (
            <div className="border-pine/50 mt-10 border-t pt-6">
              <h3 className="font-display text-xl font-bold text-white">Signals</h3>
              <ul className="mt-3 space-y-2">
                {parcel.signals.map((s) => (
                  <li key={s.id} className="text-sm text-mist">
                    <span className="text-moss font-semibold">
                      {SIGNAL_LABELS[s.type] || s.type}
                    </span>
                    <span className="text-fog ml-2 text-xs">{formatDate(s.detectedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {contacts.length ? (
            <div className="border-pine/50 mt-10 border-t pt-6">
              <h3 className="font-display text-xl font-bold text-white">Contacts</h3>
              <ul className="mt-3 space-y-2">
                {contacts.map((c) => (
                  <li key={c.id} className="text-sm text-mist">
                    <span className="font-semibold text-white">{c.name || 'Unknown'}</span>
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="text-moss ml-2">
                        {c.phone}
                      </a>
                    ) : null}
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-moss ml-2">
                        {c.email}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {outreach ? (
            <div className="border-pine/50 mt-10 border-t pt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-bold text-white">Outreach drafts</h3>
                <div className="flex gap-2">
                  <CopyButton text={outreach.callScript} label="Copy call" />
                  <CopyButton
                    text={`${outreach.emailSubject}\n\n${outreach.emailBody}`}
                    label="Copy email"
                  />
                </div>
              </div>
              <p className="text-fog mt-3 text-xs tracking-[0.16em] uppercase">Call script</p>
              <p className="mt-2 text-sm text-mist">{outreach.callScript}</p>
              <p className="text-fog mt-5 text-xs tracking-[0.16em] uppercase">Email</p>
              <p className="mt-2 text-sm font-semibold text-white">{outreach.emailSubject}</p>
              <pre className="text-mist mt-2 whitespace-pre-wrap font-sans text-sm">
                {outreach.emailBody}
              </pre>
            </div>
          ) : null}

          {activeLead ? (
            <div className="border-pine/50 mt-10 border-t pt-6">
              <h3 className="font-display text-xl font-bold text-white">Pipeline</h3>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <StatusSelect
                  value={activeLead.status}
                  onChange={(status) =>
                    void updateLeadStatus(activeLead.id, status).then(() => reload())
                  }
                  disabled={busy}
                />
                <span className="text-fog text-xs">Updated {formatDate(activeLead.updatedAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="border-pine-soft text-fog hover:border-moss hover:text-moss border px-2 py-1 text-xs font-semibold"
                    onClick={() =>
                      void logLeadOutcome(activeLead.id, o.id as LeadOutcome).then(() => {
                        push(`Logged ${o.label}`, 'success');
                        return reload();
                      })
                    }
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="border-pine-soft text-fog border px-2 py-1 text-xs"
                  onClick={() =>
                    void snoozeLead(activeLead.id, 30).then(() => {
                      push('Snoozed 30 days', 'info');
                      return reload();
                    })
                  }
                >
                  Snooze 30d
                </button>
              </div>
            </div>
          ) : (
            <div className="border-pine/50 mt-10 border-t pt-6">
              <h3 className="font-display text-xl font-bold text-white">Pipeline</h3>
              <p className="text-fog mt-2 text-sm">Not in your pipeline yet.</p>
              <button
                type="button"
                disabled={busy}
                onClick={onCreateLead}
                className="bg-moss text-ink hover:bg-moss-dim mt-4 px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Add as lead
              </button>
            </div>
          )}
          {error ? <p className="text-danger mt-4 text-sm">{error}</p> : null}
        </section>

        <aside className="space-y-8">
          <div>
            <ScoreBar score={latest?.total ?? null} large />
            {components ? (
              <ul className="mt-6 space-y-2 text-sm">
                {(
                  [
                    ['Hold period', components.holdPeriod],
                    ['Absentee', components.absentee],
                    ['Entity', components.entity],
                    ['Multi-parcel', components.multiParcel],
                    ['Land use', components.landUsePriority],
                    ['Tax delinquent', components.taxDelinquent ?? 0],
                    ['Mortgage maturity', components.mortgageMaturity ?? 0],
                    ['Foreclosure', components.foreclosure ?? 0],
                    ['SoS boost', components.sosBoost ?? 0],
                    ['FMV boost', components.fmvBoost ?? 0],
                    ['OOS decay', components.oosDecay ?? 0],
                    ['Portfolio cluster', components.portfolioCluster ?? 0],
                  ] as const
                ).map(([label, pts]) => (
                  <li key={label} className="flex justify-between border-b border-white/5 py-2">
                    <span className="text-fog">{label}</span>
                    <span className="font-semibold text-white">+{pts}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fog mt-4 text-sm">No score yet — run scoring after a sync.</p>
            )}
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-white">Owner portfolio</h3>
            <ul className="mt-3 space-y-2">
              {(parcel.owner?.parcels ?? []).map((p) => (
                <li key={p.pin}>
                  <Link
                    to={`/parcels/${encodeURIComponent(p.pin)}`}
                    className="text-moss hover:text-moss-dim text-sm"
                  >
                    {p.situsAddress || p.pin}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Sticky contact / action bar */}
      <div className="border-pine/50 bg-ink/95 fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {contact?.name || parcel.owner?.nameRaw || 'No contact'}
            </p>
            <p className="text-fog truncate text-xs">
              Score {latest?.total ?? '—'}
              {contact?.phone ? ` · ${contact.phone}` : ''}
              {contact?.email ? ` · ${contact.email}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {neighbors?.prevPin ? (
              <Link
                to={`/parcels/${encodeURIComponent(neighbors.prevPin)}`}
                className="border-pine-soft text-fog border px-3 py-2 text-sm"
              >
                Prev
              </Link>
            ) : null}
            {contact?.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="bg-moss text-ink hover:bg-moss-dim px-4 py-2 text-sm font-semibold"
              >
                Call
              </a>
            ) : null}
            {contact?.email && outreach ? (
              <a
                href={`mailto:${contact.email}?subject=${encodeURIComponent(outreach.emailSubject)}&body=${encodeURIComponent(outreach.emailBody)}`}
                className="border-moss/50 text-moss border px-4 py-2 text-sm font-semibold"
              >
                Email
              </a>
            ) : null}
            {neighbors?.nextPin ? (
              <Link
                to={`/parcels/${encodeURIComponent(neighbors.nextPin)}`}
                className="border-pine-soft text-mist border px-3 py-2 text-sm font-semibold"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fog text-xs tracking-[0.16em] uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-white">{value}</dd>
    </div>
  );
}
