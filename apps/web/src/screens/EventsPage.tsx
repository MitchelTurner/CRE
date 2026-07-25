import { useEffect, useState } from 'react';
import {
  createEvent,
  generateEventBrief,
  listEvents,
  pasteEventAttendees,
  syncEvents,
  updateEventStatus,
} from '../lib/api';
import type { EventRow } from '../lib/types';
import { useToast } from '../state/toast';
import { formatDate } from '../lib/format';

export function EventsPage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [briefHtml, setBriefHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { push } = useToast();

  async function reload() {
    const res = await listEvents();
    setItems(res.items);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    });
  }, []);

  return (
    <div className="animate-fade space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">Events</h2>
          <p className="text-fog mt-1 max-w-xl text-sm">
            Owner-density calendar + pre-event briefs. Public directories / lawful paste only — no
            LinkedIn automation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            className="bg-moss text-ink hover:bg-moss-dim px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => {
              setBusy('sync');
              void syncEvents()
                .then((r) => {
                  push(r.note || 'Event sync queued', 'success');
                  return reload();
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Sync failed'),
                )
                .finally(() => setBusy(null));
            }}
          >
            Sync feeds
          </button>
          <button
            type="button"
            disabled={!!busy}
            className="border-pine-soft text-mist border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => {
              const name = window.prompt('Event name');
              const startsAt = window.prompt('Starts at (ISO or local datetime)', new Date().toISOString());
              if (!name || !startsAt) return;
              setBusy('create');
              void createEvent({ name, startsAt, hostOrg: 'manual', ownerDensity: 'high' })
                .then(() => {
                  push('Event added', 'success');
                  return reload();
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Create failed'),
                )
                .finally(() => setBusy(null));
            }}
          >
            Add event
          </button>
        </div>
      </div>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <ul className="divide-pine/40 divide-y">
        {items.map((ev) => (
          <li key={ev.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold text-white">{ev.name}</p>
              <p className="text-fog mt-1 text-sm">
                {formatDate(ev.startsAt)} · {ev.venue || 'TBD'} · {ev.hostOrg || ev.sourceId}
              </p>
              <p className="text-brass mt-2 text-xs tracking-wide uppercase">
                {(ev.ownerDensity || 'medium').replace('_', ' ')} density · {ev.category || 'event'} ·{' '}
                {ev.status}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="border-pine-soft text-mist border px-2 py-1 text-xs font-semibold"
                onClick={() =>
                  void updateEventStatus(ev.id, 'approved').then(() => reload())
                }
              >
                Approve
              </button>
              <button
                type="button"
                className="border-pine-soft text-mist border px-2 py-1 text-xs font-semibold"
                onClick={() => setPasteFor(pasteFor === ev.id ? null : ev.id)}
              >
                Paste people
              </button>
              <button
                type="button"
                className="bg-moss text-ink px-2 py-1 text-xs font-semibold"
                onClick={() => {
                  setBusy(ev.id);
                  void generateEventBrief(ev.id)
                    .then((b) => {
                      setBriefHtml(b.htmlBody);
                      push(`Brief ready · ${b.matchCount} matches`, 'success');
                    })
                    .catch((err: unknown) =>
                      setError(err instanceof Error ? err.message : 'Brief failed'),
                    )
                    .finally(() => setBusy(null));
                }}
              >
                {busy === ev.id ? 'Brief…' : 'Generate brief'}
              </button>
            </div>
            {pasteFor === ev.id ? (
              <div className="w-full md:basis-full">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder="Name per line, or Name, Company, Title"
                  className="border-pine-soft bg-ink/40 w-full border px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  className="bg-moss text-ink mt-2 px-3 py-1.5 text-sm font-semibold"
                  onClick={() => {
                    void pasteEventAttendees(ev.id, pasteText)
                      .then((r) => {
                        push(`Linked ${r.linked} people`, 'success');
                        setPasteText('');
                        setPasteFor(null);
                      })
                      .catch((err: unknown) =>
                        setError(err instanceof Error ? err.message : 'Paste failed'),
                      );
                  }}
                >
                  Ingest paste
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <p className="text-fog text-sm">No upcoming events. Sync feeds or add one manually.</p>
      ) : null}

      {briefHtml ? (
        <div className="border-pine/40 border">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <p className="text-sm font-semibold text-white">Latest brief</p>
            <button
              type="button"
              className="text-fog text-sm"
              onClick={() => setBriefHtml(null)}
            >
              Close
            </button>
          </div>
          <iframe title="Event brief" className="h-[480px] w-full bg-white" srcDoc={briefHtml} />
        </div>
      ) : null}
    </div>
  );
}
