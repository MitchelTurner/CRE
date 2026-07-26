import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getOwner, refreshOwnerPeople } from '../lib/api';
import type { OwnerDetail } from '../lib/types';
import { formatDate, formatMoney } from '../lib/format';
import { CopyButton } from '../components/CopyButton';
import { useToast } from '../state/toast';


export function OwnerDetailPage() {
  const { id = '' } = useParams();
  const [owner, setOwner] = useState<OwnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function load() {
    const data = await getOwner(id);
    setOwner(data);
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        await load();
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load owner');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onRefresh() {
    setBusy(true);
    try {
      const data = await refreshOwnerPeople(id);
      setOwner(data);
      const r = data.refresh;
      if (r) {
        push(
          `People refresh: ${r.sosOfficers} SoS · ${r.websiteContacts} website${
            r.errors.length ? ` · ${r.errors[0]}` : ''
          }`,
          r.errors.length ? 'danger' : 'success',
        );
      } else {
        push('People refreshed', 'success');
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Refresh failed', 'danger');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div>
        <p className="text-danger text-sm">{error}</p>
        <Link to="/parcels" className="text-moss mt-4 inline-block text-sm">
          ← Parcels
        </Link>
      </div>
    );
  }

  if (!owner) {
    return <p className="text-fog animate-fade text-sm">Loading owner…</p>;
  }

  return (
    <div className="animate-fade">
      <Link to="/parcels" className="text-fog hover:text-mist text-sm">
        ← Parcels
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-moss text-xs font-semibold tracking-[0.22em] uppercase">Owner</p>
          <h2 className="font-display mt-2 text-4xl leading-tight font-bold tracking-tight text-white">
            {owner.nameRaw}
          </h2>
          <p className="text-fog mt-2 text-sm">
            {[owner.mailingAddress, owner.mailingCity, owner.mailingState, owner.mailingZip]
              .filter(Boolean)
              .join(', ') || 'No mailing address'}
          </p>
          <p className="text-fog mt-1 text-xs">
            {[
              owner.isEntity ? 'Entity' : 'Individual',
              owner.isAbsentee ? 'Absentee' : null,
              owner.sosStatus ? `SoS: ${owner.sosStatus}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRefresh()}
          className="bg-moss text-ink hover:bg-moss-dim px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Looking up people…' : 'Refresh people'}
        </button>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <section>
          <h3 className="font-display text-lg font-bold text-white">People & contacts</h3>
          <p className="text-fog mt-1 text-sm">
            Officers from SC Secretary of State and contacts found on the company website (public
            pages only — no LinkedIn automation).
          </p>

          {owner.people.length === 0 ? (
            <p className="text-fog mt-6 text-sm">
              No people yet. Click <span className="text-mist">Refresh people</span> to pull SoS
              officers and website contacts.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {owner.people.map((person) => (
                <li key={person.id} className="border-pine/50 border-b pb-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      {person.name || 'Unnamed contact'}
                    </p>
                    <span className="text-fog text-[10px] tracking-[0.14em] uppercase">
                      {person.source}
                      {person.role ? ` · ${person.role}` : ''}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    {person.email ? (
                      <span className="inline-flex items-center gap-2">
                        <a href={`mailto:${person.email}`} className="text-moss">
                          {person.email}
                        </a>
                        <CopyButton text={person.email} label="Copy" />
                      </span>
                    ) : null}
                    {person.phone ? (
                      <span className="inline-flex items-center gap-2">
                        <a href={`tel:${person.phone}`} className="text-moss">
                          {person.phone}
                        </a>
                        <CopyButton text={person.phone} label="Copy" />
                      </span>
                    ) : null}
                    {!person.email && !person.phone ? (
                      <span className="text-fog text-xs">Name/role only — no phone or email yet</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-display text-lg font-bold text-white">Company info</h3>
          <dl className="mt-5 space-y-4">
            <Fact label="Website">
              {owner.websiteUrl ? (
                <a
                  href={owner.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-moss break-all"
                >
                  {owner.websiteUrl}
                </a>
              ) : (
                '—'
              )}
            </Fact>
            <Fact label="Website checked">{formatDate(owner.websiteFetchedAt)}</Fact>
            <Fact label="SoS entity ID">{owner.sosEntityId || '—'}</Fact>
            <Fact label="SoS status">{owner.sosStatus || '—'}</Fact>
            <Fact label="Registered agent">{owner.sosRegisteredAgent || '—'}</Fact>
            <Fact label="Agent address">{owner.sosAgentAddress || '—'}</Fact>
            <Fact label="SoS checked">{formatDate(owner.sosFetchedAt)}</Fact>
          </dl>
        </section>
      </div>

      <section className="mt-12">
        <h3 className="font-display text-lg font-bold text-white">Portfolio parcels</h3>
        {owner.parcels.length === 0 ? (
          <p className="text-fog mt-3 text-sm">No linked parcels.</p>
        ) : (
          <ul className="mt-4 divide-y divide-pine/40">
            {owner.parcels.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <div>
                  <Link
                    to={`/parcels/${encodeURIComponent(p.pin)}`}
                    className="text-sm font-semibold text-white hover:text-moss"
                  >
                    {p.situsAddress || p.pin}
                  </Link>
                  <p className="text-fog mt-0.5 font-mono text-xs">{p.pin}</p>
                </div>
                <p className="text-fog text-xs">
                  {[p.propType || p.landUseCode, formatMoney(p.fairMarketVal), p.score != null ? `score ${p.score}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-fog text-xs tracking-[0.16em] uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-white">{children}</dd>
    </div>
  );
}
