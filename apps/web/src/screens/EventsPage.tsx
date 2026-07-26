import { useEffect, useState } from 'react';
import {
  createEvent,
  generateEventBrief,
  listEvents,
  markEventAttendeeMet,
  pasteEventAttendees,
  pasteEvents,
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
  const [eventPasteOpen, setEventPasteOpen] = useState(false);
  const [eventPasteText, setEventPasteText] = useState('');
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
                .then(async (r) => {
                  push(r.note || 'Event sync queued', 'success');
                  // Worker runs in-process; give it a moment then refresh.
                  await new Promise((resolve) => setTimeout(resolve, 1200));
                  return reload();
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Sync failed'),
                )
                .finally(() => setBusy(null));
            }}
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync feeds'}
          </button>
          <button
            type="button"
            disabled={!!busy}
            className="border-pine-soft text-mist border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => setEventPasteOpen((v) => !v)}
          >
            Paste events
          </button>
          <button
            type="button"
            disabled={!!busy}
            className="border-pine-soft text-mist border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => {
              const name = window.prompt('Event name');
              const startsAt = window.prompt(
                'Starts at (ISO or local datetime)',
                new Date().toISOString(),
              );
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

      {eventPasteOpen ? (
        <div className="border-pine/40 border p-4">
          <p className="text-sm font-semibold text-white">Paste future events</p>
          <p className="text-fog mt-1 text-xs">
            One per line: Name | 2026-08-15T17:00 | Venue | Host | URL — copy from public pages or
            LinkedIn in your browser. We do not log in or scrape LinkedIn.
          </p>
          <textarea
            value={eventPasteText}
            onChange={(e) => setEventPasteText(e.target.value)}
            rows={5}
            placeholder={
              'NAIOP Upstate Lunch | 2026-08-20T11:30 | Greenville | NAIOP | https://...\nCCIM Chapter | 2026-09-10T12:00 | Downtown | CCIM'
            }
            className="border-pine-soft bg-ink/40 mt-3 w-full border px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            className="bg-moss text-ink mt-2 px-3 py-1.5 text-sm font-semibold"
            onClick={() => {
              setBusy('paste-events');
              void pasteEvents(eventPasteText)
                .then((r) => {
                  push(`Added ${r.created} events`, 'success');
                  if (r.errors?.length) setError(r.errors.slice(0, 3).join(' · '));
                  setEventPasteText('');
                  setEventPasteOpen(false);
                  return reload();
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Paste failed'),
                )
                .finally(() => setBusy(null));
            }}
          >
            {busy === 'paste-events' ? 'Saving…' : 'Save pasted events'}
          </button>
        </div>
      ) : null}

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
                {ev.sourceId === 'seed' ? ' · placeholder' : ''}
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
                        return reload();
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
            {ev.attendees?.length ? (
              <ul className="border-pine/30 w-full space-y-2 border-t pt-3 md:basis-full">
                {ev.attendees.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <span className="font-semibold text-white">{a.person.nameRaw}</span>
                      {a.person.company ? (
                        <span className="text-fog ml-2 text-xs">{a.person.company}</span>
                      ) : null}
                      {a.metAt ? (
                        <span className="text-moss ml-2 text-xs">Met {formatDate(a.metAt)}</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="border-pine-soft text-mist border px-2 py-1 text-xs font-semibold"
                      onClick={() =>
                        void markEventAttendeeMet(ev.id, a.personId, !a.metAt)
                          .then(() => {
                            push(a.metAt ? 'Cleared met' : 'Marked met', 'success');
                            return reload();
                          })
                          .catch((err: unknown) =>
                            setError(err instanceof Error ? err.message : 'Mark met failed'),
                          )
                      }
                    >
                      {a.metAt ? 'Clear met' : 'Mark met'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <div className="border-pine/40 space-y-3 border p-5">
          <p className="text-sm font-semibold text-white">No upcoming events yet</p>
          <p className="text-fog text-sm">
            Click <span className="text-mist">Sync feeds</span> to load the Greenville CRE seed
            calendar (works without API keys). For live listings, set{' '}
            <span className="text-mist">EVENTBRITE_TOKEN</span> or{' '}
            <span className="text-mist">EVENT_ICS_FEEDS</span> in Railway, or use{' '}
            <span className="text-mist">Paste events</span> / <span className="text-mist">Add event</span>.
          </p>
          <p className="text-fog text-xs">
            LinkedIn: copy event title + date from your browser and paste here — we will not search
            or scrape LinkedIn for you.
          </p>
        </div>
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
