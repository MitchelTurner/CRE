import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createLead, getParcel, updateLeadStatus } from '../lib/api';
import type { LeadStatus, ParcelDetail } from '../lib/types';
import { formatDate, formatMoney, yearsHeld } from '../lib/format';
import { ScoreBar } from '../components/ScoreBar';
import { StatusSelect } from '../components/StatusSelect';

export function ParcelDetailPage() {
  const { pin = '' } = useParams();
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const data = await getParcel(pin);
    setParcel(data);
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getParcel(pin)
      .then((data) => {
        if (!cancelled) setParcel(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load parcel');
      });
    return () => {
      cancelled = true;
    };
  }, [pin]);

  const latest = parcel?.scores[0];
  const activeLead = parcel?.leads[0];

  async function onCreateLead() {
    if (!parcel) return;
    setBusy(true);
    try {
      await createLead(parcel.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create lead');
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(status: LeadStatus) {
    if (!activeLead) return;
    setBusy(true);
    try {
      await updateLeadStatus(activeLead.id, status);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status');
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

  return (
    <div className="animate-fade">
      <Link to="/parcels" className="text-fog hover:text-moss text-sm">
        ← Parcels
      </Link>

      <div className="mt-5 grid gap-10 lg:grid-cols-[1.4fr_0.9fr]">
        <section>
          <p className="text-moss text-xs font-semibold tracking-[0.22em] uppercase">
            {parcel.propType || parcel.landUseCode || 'Commercial'}
          </p>
          <h2 className="font-display mt-2 text-4xl leading-tight font-bold tracking-tight text-white">
            {parcel.situsAddress || 'No situs address'}
          </h2>
          <p className="text-fog mt-3 font-mono text-sm">{parcel.pin}</p>

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
          </dl>

          {activeLead ? (
            <div className="border-pine/50 mt-10 border-t pt-6">
              <h3 className="font-display text-xl font-bold text-white">Pipeline</h3>
              <p className="text-fog mt-2 text-sm">{activeLead.whyNow}</p>
              <div className="mt-4 flex items-center gap-3">
                <StatusSelect value={activeLead.status} onChange={onStatus} disabled={busy} />
                <span className="text-fog text-xs">Updated {formatDate(activeLead.updatedAt)}</span>
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
                  <span className="text-fog ml-2 text-xs">{p.propType || p.landUseCode}</span>
                </li>
              ))}
              {!parcel.owner?.parcels?.length ? (
                <li className="text-fog text-sm">No other commercial parcels linked.</li>
              ) : null}
            </ul>
          </div>
        </aside>
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