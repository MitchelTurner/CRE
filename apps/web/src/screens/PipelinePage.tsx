import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listLeads, updateLeadStatus } from '../lib/api';
import type { LeadRow, LeadStatus } from '../lib/types';
import { STATUS_LABELS } from '../lib/format';
import { StatusSelect } from '../components/StatusSelect';
import { ScoreBar } from '../components/ScoreBar';

const FILTERS: Array<LeadStatus | 'all'> = ['all', 'new', 'sent', 'contacted', 'dead', 'deal'];

export function PipelinePage() {
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');
  const [items, setItems] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload(status: LeadStatus | 'all') {
    setLoading(true);
    setError(null);
    try {
      const res = await listLeads(status === 'all' ? undefined : status);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload(filter);
  }, [filter]);

  async function onStatus(id: string, status: LeadStatus) {
    await updateLeadStatus(id, status);
    await reload(filter);
  }

  return (
    <div className="animate-fade">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">Pipeline</h2>
        <p className="text-fog mt-1 max-w-xl text-sm">
          Leads from digests and parcels you promoted. Track contact progress without a CRM.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={[
              'px-3 py-1.5 text-sm font-semibold tracking-wide transition',
              filter === f ? 'bg-moss text-ink' : 'text-fog hover:text-mist',
            ].join(' ')}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {error ? <p className="text-danger mb-4 text-sm">{error}</p> : null}
      {loading ? <p className="text-fog text-sm">Loading…</p> : null}

      <ul className="divide-pine/40 divide-y">
        {items.map((lead) => {
          const score = lead.parcel.scores[0]?.total ?? null;
          return (
            <li
              key={lead.id}
              className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={`/parcels/${encodeURIComponent(lead.parcel.pin)}`}
                  className="font-display text-xl font-bold text-white hover:text-moss"
                >
                  {lead.parcel.situsAddress || lead.parcel.pin}
                </Link>
                <p className="text-fog mt-1 text-sm">
                  {lead.parcel.owner?.nameRaw || 'Unknown owner'}
                  {lead.parcel.propType ? ` · ${lead.parcel.propType}` : ''}
                </p>
                <p className="mt-2 text-sm text-mist/90">{lead.whyNow}</p>
              </div>
              <div className="flex items-center gap-6">
                <ScoreBar score={score} />
                <StatusSelect
                  value={lead.status}
                  onChange={(status) => void onStatus(lead.id, status)}
                />
              </div>
            </li>
          );
        })}
        {!loading && items.length === 0 ? (
          <li className="text-fog py-12 text-center text-sm">
            No leads yet. Promote a parcel or send a weekly digest.
          </li>
        ) : null}
      </ul>
    </div>
  );
}