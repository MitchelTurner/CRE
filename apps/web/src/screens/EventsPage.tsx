import { useEffect, useMemo, useState } from 'react';
import {
  createEvent,
  generateEventBrief,
  listEvents,
  markEventAttendeeMet,
  ocrEventAttendees,
  pasteEventAttendees,
  pasteEvents,
  syncEvents,
  updateEventStatus,
} from '../lib/api';
import type { EventRow } from '../lib/types';
import { useToast } from '../state/toast';
import { formatDate, formatEventWhen } from '../lib/format';
import { announceAward } from '../lib/awards';
import { NotesPanel } from '../components/NotesPanel';

type FilterId = 'upcoming' | 'soon' | 'high' | 'attended' | 'all';
type PanelId = 'people' | 'notes' | 'paste' | 'ocr' | null;

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'soon', label: 'This week' },
  { id: 'high', label: 'High density' },
  { id: 'attended', label: 'Attended' },
  { id: 'all', label: 'All' },
];

export function EventsPage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>('upcoming');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId>(null);
  const [pasteText, setPasteText] = useState('');
  const [eventPasteOpen, setEventPasteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [eventPasteText, setEventPasteText] = useState('');
  const [briefHtml, setBriefHtml] = useState<string | null>(null);
  const [briefTitle, setBriefTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({
    name: '',
    startsAt: toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    venue: '',
    hostOrg: '',
  });
  const { push } = useToast();

  async function reload() {
    // Load from 60 days ago so "Attended" still shows recent past events.
    const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const res = await listEvents({ from });
    setItems(res.items);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    });
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    const week = now + 7 * 24 * 60 * 60 * 1000;
    return items
      .filter((ev) => {
        const t = new Date(ev.startsAt).getTime();
        if (filter === 'upcoming') return t >= now - 6 * 60 * 60 * 1000 && ev.status !== 'hidden';
        if (filter === 'soon') return t >= now && t <= week && ev.status !== 'hidden';
        if (filter === 'high') return ev.ownerDensity === 'high' && t >= now - 6 * 60 * 60 * 1000;
        if (filter === 'attended') return ev.status === 'attended';
        return ev.status !== 'hidden';
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [items, filter]);

  const stats = useMemo(() => {
    const now = Date.now();
    const upcoming = items.filter(
      (e) => new Date(e.startsAt).getTime() >= now && e.status !== 'hidden',
    );
    const high = upcoming.filter((e) => e.ownerDensity === 'high').length;
    const attended = items.filter((e) => e.status === 'attended').length;
    const met = items.reduce(
      (n, e) => n + (e.attendees?.filter((a) => a.metAt).length ?? 0),
      0,
    );
    return { upcoming: upcoming.length, high, attended, met };
  }, [items]);

  function toggleExpand(id: string, nextPanel: PanelId = 'people') {
    if (expandedId === id && panel === nextPanel) {
      setExpandedId(null);
      setPanel(null);
      return;
    }
    setExpandedId(id);
    setPanel(nextPanel);
  }

  return (
    <div className="animate-fade relative z-[1] flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-moss text-xs font-semibold tracking-[0.22em] uppercase">Calendar</p>
          <h2 className="font-display mt-2 text-4xl font-bold tracking-tight text-white">Events</h2>
          <p className="text-fog mt-2 max-w-xl text-sm">
            Pick high-density rooms, prep a brief, show up, mark who you met — earn XP for each step.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            className="btn-primary disabled:opacity-50"
            onClick={() => {
              setBusy('sync');
              void syncEvents()
                .then(async (r) => {
                  push(r.note || 'Event sync queued', 'success');
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
            className="btn-ghost disabled:opacity-50"
            onClick={() => {
              setEventPasteOpen((v) => !v);
              setAddOpen(false);
            }}
          >
            Paste events
          </button>
          <button
            type="button"
            disabled={!!busy}
            className="btn-ghost disabled:opacity-50"
            onClick={() => {
              setAddOpen((v) => !v);
              setEventPasteOpen(false);
            }}
          >
            Add event
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Upcoming" value={String(stats.upcoming)} />
        <Stat label="High density" value={String(stats.high)} />
        <Stat label="Attended" value={String(stats.attended)} />
        <Stat label="People met" value={String(stats.met)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={filter === f.id ? 'chip-active' : 'chip'}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-danger glass rounded-2xl px-4 py-3 text-sm">{error}</p>
      ) : null}

      {addOpen ? (
        <section className="glass rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold text-white">Add event</h3>
          <p className="text-fog mt-1 text-xs">Name + start time required. Venue/host optional.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <input
              className="field md:col-span-2"
              placeholder="Event name"
              value={addForm.name}
              onChange={(e) => setAddForm((s) => ({ ...s, name: e.target.value }))}
            />
            <input
              type="datetime-local"
              className="field"
              value={addForm.startsAt}
              onChange={(e) => setAddForm((s) => ({ ...s, startsAt: e.target.value }))}
            />
            <input
              className="field"
              placeholder="Venue"
              value={addForm.venue}
              onChange={(e) => setAddForm((s) => ({ ...s, venue: e.target.value }))}
            />
            <input
              className="field md:col-span-2"
              placeholder="Host org"
              value={addForm.hostOrg}
              onChange={(e) => setAddForm((s) => ({ ...s, hostOrg: e.target.value }))}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === 'create' || !addForm.name.trim() || !addForm.startsAt}
              className="btn-primary disabled:opacity-50"
              onClick={() => {
                setBusy('create');
                void createEvent({
                  name: addForm.name.trim(),
                  startsAt: new Date(addForm.startsAt).toISOString(),
                  venue: addForm.venue || undefined,
                  hostOrg: addForm.hostOrg || 'manual',
                  ownerDensity: 'high',
                })
                  .then(() => {
                    push('Event added', 'success');
                    setAddForm({
                      name: '',
                      startsAt: toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
                      venue: '',
                      hostOrg: '',
                    });
                    setAddOpen(false);
                    return reload();
                  })
                  .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : 'Create failed'),
                  )
                  .finally(() => setBusy(null));
              }}
            >
              {busy === 'create' ? 'Saving…' : 'Save event'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {eventPasteOpen ? (
        <section className="glass rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold text-white">Paste future events</h3>
          <p className="text-fog mt-1 text-xs">
            One per line: Name | 2026-08-15T17:00 | Venue | Host | URL — copy from public pages. No
            LinkedIn login/scrape.
          </p>
          <textarea
            value={eventPasteText}
            onChange={(e) => setEventPasteText(e.target.value)}
            rows={5}
            placeholder={
              'NAIOP Upstate Lunch | 2026-08-20T11:30 | Greenville | NAIOP | https://...\nCCIM Chapter | 2026-09-10T12:00 | Downtown | CCIM'
            }
            className="field mt-3 w-full"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
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
            <button type="button" className="btn-ghost" onClick={() => setEventPasteOpen(false)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {filtered.length === 0 ? (
        <div className="glass space-y-3 rounded-3xl p-6">
          <p className="font-display text-lg font-bold text-white">No events in this view</p>
          <p className="text-fog text-sm">
            Sync feeds for the Greenville CRE seed calendar, paste events from a public page, or add
            one manually.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => setFilter('all')}>
              Show all
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(true)}>
              Add event
            </button>
          </div>
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-4 p-0">
          {filtered.map((ev, index) => {
            const when = formatEventWhen(ev.startsAt);
            const open = expandedId === ev.id;
            const attendees = ev.attendees ?? [];
            const metCount = attendees.filter((a) => a.metAt).length;
            const isNext = index === 0 && filter !== 'attended' && !when.isPast;
            const attended = ev.status === 'attended';

            return (
              <li
                key={ev.id}
                className={[
                  'event-card',
                  isNext ? 'event-card-next' : '',
                  attended ? 'opacity-85' : '',
                ].join(' ')}
              >
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    className="w-full min-w-0 text-left"
                    onClick={() => toggleExpand(ev.id, open ? panel : 'people')}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {isNext ? (
                        <span className="chip-active !py-0.5 !text-[10px]">Next up</span>
                      ) : null}
                      <StatusPill status={ev.status} />
                      <DensityPill density={ev.ownerDensity} />
                      {when.relative ? (
                        <span
                          className={[
                            'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                            when.isSoon ? 'bg-brass/15 text-brass' : 'bg-ink/50 text-fog',
                          ].join(' ')}
                        >
                          {when.relative}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-display mt-2 break-words text-xl leading-snug font-bold text-white">
                      {ev.name}
                    </p>
                    <p className="text-mist mt-1 text-sm break-words">
                      {when.absolute}
                      {ev.venue ? ` · ${ev.venue}` : ''}
                      {ev.city ? `, ${ev.city}` : ''}
                    </p>
                    <p className="text-fog mt-1 text-xs break-words">
                      {ev.hostOrg || ev.sourceId}
                      {ev.category ? ` · ${ev.category}` : ''}
                      {ev.sourceId === 'seed' ? ' · placeholder' : ''}
                      {attendees.length
                        ? ` · ${metCount}/${attendees.length} met`
                        : ' · no people yet'}
                    </p>
                  </button>

                  <div className="flex w-full flex-wrap content-start gap-2">
                    {!attended ? (
                      <button
                        type="button"
                        className="btn-primary !text-xs"
                        onClick={() =>
                          void updateEventStatus(ev.id, 'attended').then((r) => {
                            announceAward(push, r.award, 'Marked attended');
                            return reload();
                          })
                        }
                      >
                        I attended
                      </button>
                    ) : (
                      <span className="chip-active">Attended ✓</span>
                    )}
                    {ev.status === 'new' ? (
                      <button
                        type="button"
                        className="btn-ghost !text-xs"
                        onClick={() =>
                          void updateEventStatus(ev.id, 'approved').then(() => {
                            push('Approved', 'success');
                            return reload();
                          })
                        }
                      >
                        Approve
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost !text-xs"
                      disabled={busy === ev.id}
                      onClick={() => {
                        setBusy(ev.id);
                        void generateEventBrief(ev.id)
                          .then((b) => {
                            setBriefHtml(b.htmlBody);
                            setBriefTitle(ev.name);
                            push(`Brief ready · ${b.matchCount} matches`, 'success');
                          })
                          .catch((err: unknown) =>
                            setError(err instanceof Error ? err.message : 'Brief failed'),
                          )
                          .finally(() => setBusy(null));
                      }}
                    >
                      {busy === ev.id ? 'Brief…' : 'Prep brief'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !text-xs"
                      onClick={() => toggleExpand(ev.id, 'people')}
                    >
                      People {attendees.length ? `(${attendees.length})` : ''}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !text-xs"
                      onClick={() => toggleExpand(ev.id, 'notes')}
                    >
                      Notes
                    </button>
                    {ev.url ? (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost !text-xs"
                      >
                        Open link
                      </a>
                    ) : null}
                  </div>
                </div>

                {open ? (
                  <div className="border-pine/35 mt-5 border-t pt-4">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {(
                        [
                          ['people', 'People'],
                          ['paste', 'Paste people'],
                          ['ocr', 'OCR roster'],
                          ['notes', 'Notes'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={panel === id ? 'chip-active' : 'chip'}
                          onClick={() => setPanel(id)}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="chip ml-auto"
                        onClick={() => {
                          setExpandedId(null);
                          setPanel(null);
                        }}
                      >
                        Collapse
                      </button>
                    </div>

                    {panel === 'people' ? (
                      attendees.length ? (
                        <ul className="space-y-2">
                          {attendees.map((a) => (
                            <li
                              key={a.id}
                              className="bg-ink/35 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white">
                                  {a.person.nameRaw}
                                  {a.metAt ? (
                                    <span className="text-moss ml-2 text-[11px] font-bold">
                                      Met
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-fog text-xs">
                                  {[a.person.company, a.person.title, a.role]
                                    .filter(Boolean)
                                    .join(' · ') || 'Attendee'}
                                  {a.metAt ? ` · ${formatDate(a.metAt)}` : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                className={
                                  a.metAt ? 'btn-ghost !px-3 !py-1.5 !text-xs' : 'btn-primary !px-3 !py-1.5 !text-xs'
                                }
                                onClick={() =>
                                  void markEventAttendeeMet(ev.id, a.personId, !a.metAt)
                                    .then((r) => {
                                      announceAward(
                                        push,
                                        r.award,
                                        a.metAt ? 'Cleared met' : 'Marked met',
                                      );
                                      return reload();
                                    })
                                    .catch((err: unknown) =>
                                      setError(
                                        err instanceof Error ? err.message : 'Mark met failed',
                                      ),
                                    )
                                }
                              >
                                {a.metAt ? 'Undo' : 'Mark met +40 XP'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="bg-ink/30 rounded-2xl px-4 py-5">
                          <p className="text-sm text-white">No people linked yet</p>
                          <p className="text-fog mt-1 text-xs">
                            Paste a roster, then mark who you actually met.
                          </p>
                          <button
                            type="button"
                            className="btn-primary mt-3 !text-xs"
                            onClick={() => setPanel('paste')}
                          >
                            Paste people
                          </button>
                        </div>
                      )
                    ) : null}

                    {panel === 'paste' ? (
                      <div>
                        <p className="text-fog text-xs">
                          One name per line, or Name, Company, Title
                        </p>
                        <textarea
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                          rows={4}
                          placeholder="Jane Doe, Acme Holdings, Principal"
                          className="field mt-2 w-full"
                        />
                        <button
                          type="button"
                          className="btn-primary mt-2"
                          disabled={!pasteText.trim()}
                          onClick={() => {
                            void pasteEventAttendees(ev.id, pasteText)
                              .then((r) => {
                                push(`Linked ${r.linked} people`, 'success');
                                setPasteText('');
                                setPanel('people');
                                return reload();
                              })
                              .catch((err: unknown) =>
                                setError(err instanceof Error ? err.message : 'Paste failed'),
                              );
                          }}
                        >
                          Link people
                        </button>
                      </div>
                    ) : null}

                    {panel === 'ocr' ? (
                      <div>
                        <p className="text-fog text-xs">
                          Photo a printed roster or screenshot you lawfully have. AI extracts names
                          (+20 XP). Needs LLM enabled. No LinkedIn scrape.
                        </p>
                        <label className="btn-ghost mt-3 inline-flex cursor-pointer">
                          {busy === `ocr-${ev.id}` ? 'Reading…' : 'Choose roster photo'}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={busy === `ocr-${ev.id}`}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setBusy(`ocr-${ev.id}`);
                              const reader = new FileReader();
                              reader.onload = () => {
                                const dataUrl = String(reader.result || '');
                                const imageBase64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
                                const mediaType = (
                                  file.type === 'image/png' ||
                                  file.type === 'image/webp' ||
                                  file.type === 'image/gif'
                                    ? file.type
                                    : 'image/jpeg'
                                ) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
                                void ocrEventAttendees(ev.id, { imageBase64, mediaType })
                                  .then((r) => {
                                    announceAward(
                                      push,
                                      r.award,
                                      `Linked ${r.linked} from roster`,
                                    );
                                    setPanel('people');
                                    return reload();
                                  })
                                  .catch((err: unknown) =>
                                    setError(
                                      err instanceof Error ? err.message : 'OCR failed',
                                    ),
                                  )
                                  .finally(() => setBusy(null));
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                      </div>
                    ) : null}

                    {panel === 'notes' ? (
                      <NotesPanel
                        kind="meeting"
                        eventId={ev.id}
                        heading="Event notes"
                        placeholder="Who you met · what they own · follow-up"
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {briefHtml ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Event brief"
          onClick={() => {
            setBriefHtml(null);
            setBriefTitle(null);
          }}
        >
          <div
            className="glass flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-fog text-[10px] tracking-[0.16em] uppercase">Prep brief</p>
                <p className="text-sm font-semibold text-white">{briefTitle || 'Event brief'}</p>
              </div>
              <button
                type="button"
                className="btn-ghost !text-xs"
                onClick={() => {
                  setBriefHtml(null);
                  setBriefTitle(null);
                }}
              >
                Close
              </button>
            </div>
            <iframe title="Event brief" className="min-h-[420px] w-full flex-1 bg-white" srcDoc={briefHtml} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <p className="text-fog text-xs tracking-[0.16em] uppercase">{label}</p>
      <p className="font-display mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: 'bg-ink/50 text-fog',
    approved: 'bg-moss/15 text-moss',
    attended: 'bg-moss/25 text-moss',
    hidden: 'bg-danger/15 text-danger',
  };
  return (
    <span
      className={[
        'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
        map[status] || map.new,
      ].join(' ')}
    >
      {status}
    </span>
  );
}

function DensityPill({ density }: { density?: string | null }) {
  const d = density || 'medium';
  const tone =
    d === 'high'
      ? 'bg-brass/20 text-brass'
      : d === 'low'
        ? 'bg-ink/50 text-fog'
        : 'bg-pine-soft/30 text-mist';
  return (
    <span
      className={[
        'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
        tone,
      ].join(' ')}
    >
      {d} density
    </span>
  );
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
