import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listLeads,
  logLeadOutcome,
  snoozeLead,
  submitLeadFeedback,
  updateLeadStatus,
} from '../lib/api';
import type { FeedbackReason, LeadOutcome, LeadRow, LeadStatus } from '../lib/types';
import { STATUS_LABELS } from '../lib/format';
import { FEEDBACK_REASONS, OUTCOMES, shortWhyNow } from '../lib/signals';
import { StatusSelect } from '../components/StatusSelect';
import { ScoreBar } from '../components/ScoreBar';
import { SignalChips } from '../components/SignalChips';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../state/toast';

const FILTERS: Array<LeadStatus | 'all'> = [
  'all',
  'new',
  'sent',
  'contacted',
  'invited',
  'attended_event',
  'dead',
  'deal',
];

export function PipelinePage() {
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');
  const [items, setItems] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const { push } = useToast();

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

  return (
    <div className="animate-fade">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">Pipeline</h2>
        <p className="text-fog mt-1 max-w-xl text-sm">
          Log outcomes in one tap. Snooze noise. Thumbs-down asks why so scoring can learn.
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

      {!loading && items.length === 0 ? (
        <EmptyState
          title="No leads yet"
          body="Promote a parcel or send a weekly digest to fill the pipeline."
          actionTo="/parcels"
          actionLabel="Browse parcels"
        />
      ) : (
        <ul className="divide-pine/40 divide-y">
          {items.map((lead) => {
            const score = lead.parcel.scores[0]?.total ?? null;
            const phone = lead.parcel.owner?.contacts?.[0]?.phone;
            const email = lead.parcel.owner?.contacts?.[0]?.email;
            const latestFeedback = lead.feedback?.[0];
            return (
              <li key={lead.id} className="py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-mist/90">{shortWhyNow(lead.whyNow, 180)}</p>
                    <SignalChips types={lead.signalTypes} />
                    <Link
                      to={`/parcels/${encodeURIComponent(lead.parcel.pin)}`}
                      className="font-display mt-2 block text-xl font-bold text-white hover:text-moss"
                    >
                      {lead.parcel.situsAddress || lead.parcel.pin}
                    </Link>
                    <p className="text-fog mt-1 text-sm">
                      {lead.parcel.owner?.nameRaw || 'Unknown owner'}
                      {lead.lastOutcome ? ` · last: ${lead.lastOutcome.replace('_', ' ')}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <ScoreBar score={score} />
                    {phone ? (
                      <a href={`tel:${phone}`} className="bg-moss text-ink px-3 py-1.5 text-sm font-semibold">
                        Call
                      </a>
                    ) : null}
                    {email ? (
                      <a
                        href={`mailto:${email}`}
                        className="border-pine-soft text-mist border px-3 py-1.5 text-sm font-semibold"
                      >
                        Email
                      </a>
                    ) : null}
                    <StatusSelect
                      value={lead.status}
                      onChange={(status) =>
                        void updateLeadStatus(lead.id, status).then(() => reload(filter))
                      }
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="border-pine-soft/60 text-fog hover:border-moss hover:text-moss border px-2 py-1 text-xs font-semibold"
                      onClick={() =>
                        void logLeadOutcome(lead.id, o.id as LeadOutcome)
                          .then(() => {
                            push(`Logged ${o.label}`, 'success');
                            return reload(filter);
                          })
                          .catch((err: unknown) =>
                            push(err instanceof Error ? err.message : 'Outcome failed', 'danger'),
                          )
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="border-pine-soft/60 text-fog hover:text-mist border px-2 py-1 text-xs"
                    onClick={() =>
                      void snoozeLead(lead.id, 30).then(() => {
                        push('Snoozed 30 days', 'info');
                        return reload(filter);
                      })
                    }
                  >
                    Snooze 30d
                  </button>
                  <button
                    type="button"
                    className="border-pine-soft/60 text-fog hover:text-mist border px-2 py-1 text-xs"
                    onClick={() =>
                      void snoozeLead(lead.id, 90).then(() => {
                        push('Snoozed 90 days', 'info');
                        return reload(filter);
                      })
                    }
                  >
                    Snooze 90d
                  </button>
                  <button
                    type="button"
                    className={[
                      'px-2 py-1 text-xs font-semibold',
                      latestFeedback?.rating === 'up' ? 'text-moss' : 'text-fog hover:text-moss',
                    ].join(' ')}
                    onClick={() =>
                      void submitLeadFeedback(lead.id, 'up').then(() => reload(filter))
                    }
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className={[
                      'px-2 py-1 text-xs font-semibold',
                      latestFeedback?.rating === 'down' ? 'text-danger' : 'text-fog hover:text-danger',
                    ].join(' ')}
                    onClick={() => setReasonFor(lead.id)}
                  >
                    ▼
                  </button>
                </div>

                {reasonFor === lead.id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-fog self-center text-xs">Why weak?</span>
                    {FEEDBACK_REASONS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="border-danger/40 text-danger border px-2 py-1 text-xs font-semibold"
                        onClick={() =>
                          void submitLeadFeedback(
                            lead.id,
                            'down',
                            undefined,
                            r.id as FeedbackReason,
                          ).then(() => {
                            setReasonFor(null);
                            push(`Noted: ${r.label}`, 'info');
                            return reload(filter);
                          })
                        }
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
