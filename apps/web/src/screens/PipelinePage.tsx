import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listLeads, submitLeadFeedback, updateLeadStatus } from '../lib/api';
import type { FeedbackRating, LeadRow, LeadStatus } from '../lib/types';
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

  async function onFeedback(id: string, rating: FeedbackRating) {
    await submitLeadFeedback(id, rating);
    await reload(filter);
  }

  return (
    <div className="animate-fade">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">Pipeline</h2>
        <p className="text-fog mt-1 max-w-xl text-sm">
          Leads from digests and parcels you promoted. Thumb feedback tunes digest quality over time.
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
          const latestFeedback = lead.feedback?.[0]?.rating;
          return (
            <li
              key={lead.id}
              className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    to={`/parcels/${encodeURIComponent(lead.parcel.pin)}`}
                    className="font-display text-xl font-bold text-white hover:text-moss"
                  >
                    {lead.parcel.situsAddress || lead.parcel.pin}
                  </Link>
                  {lead.leadType && lead.leadType !== 'seller' ? (
                    <span className="text-brass text-xs tracking-wide uppercase">
                      {lead.leadType.replace('_', ' ')}
                    </span>
                  ) : null}
                </div>
                <p className="text-fog mt-1 text-sm">
                  {lead.parcel.owner?.nameRaw || 'Unknown owner'}
                  {lead.parcel.propType ? ` · ${lead.parcel.propType}` : ''}
                </p>
                <p className="mt-2 text-sm text-mist/90">{lead.whyNow}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <ScoreBar score={score} />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Good lead"
                    onClick={() => void onFeedback(lead.id, 'up')}
                    className={[
                      'px-2 py-1 text-sm font-semibold',
                      latestFeedback === 'up' ? 'text-moss' : 'text-fog hover:text-moss',
                    ].join(' ')}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    title="Weak lead"
                    onClick={() => void onFeedback(lead.id, 'down')}
                    className={[
                      'px-2 py-1 text-sm font-semibold',
                      latestFeedback === 'down' ? 'text-danger' : 'text-fog hover:text-danger',
                    ].join(' ')}
                  >
                    ▼
                  </button>
                </div>
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
