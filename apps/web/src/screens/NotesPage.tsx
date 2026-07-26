import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createNote, deleteNote, listNotes } from '../lib/api';
import type { NoteKind, NoteRow } from '../lib/types';
import { announceAward } from '../lib/awards';
import { formatDate } from '../lib/format';
import { useToast } from '../state/toast';

const TABS: Array<{ id: NoteKind | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'property', label: 'Properties' },
  { id: 'connection', label: 'Connections' },
  { id: 'meeting', label: 'Meetings' },
];

export function NotesPage() {
  const [tab, setTab] = useState<NoteKind | 'all'>('all');
  const [items, setItems] = useState<NoteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<NoteKind>('meeting');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [meetingAt, setMeetingAt] = useState('');
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function reload(next = tab) {
    const res = await listNotes(next === 'all' ? {} : { kind: next });
    setItems(res.items);
  }

  useEffect(() => {
    void reload(tab).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Failed to load notes'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="animate-rise space-y-8">
      <div>
        <p className="text-moss text-xs font-semibold tracking-[0.22em] uppercase">Memory</p>
        <h2 className="font-display mt-2 text-4xl font-bold tracking-tight text-white">Notes</h2>
        <p className="text-fog mt-2 max-w-xl text-sm">
          Capture what you heard on calls, at events, and about properties — so you never have to
          hold it all in your head.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'chip-active' : 'chip'}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="glass rounded-2xl p-5">
        <h3 className="font-display text-lg font-bold text-white">Quick note</h3>
        <p className="text-fog mt-1 text-xs">
          Tip: open a parcel or event to attach notes to that place/person. Quick notes here are
          great for meetings.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-[160px_1fr]">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as NoteKind)}
            className="field"
          >
            <option value="meeting">Meeting</option>
            <option value="connection">Connection</option>
            <option value="property">Property</option>
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="field"
          />
        </div>
        {kind === 'meeting' ? (
          <input
            type="datetime-local"
            value={meetingAt}
            onChange={(e) => setMeetingAt(e.target.value)}
            className="field mt-2 w-full md:max-w-xs"
          />
        ) : null}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Who · what · next step"
          className="field mt-2 w-full"
        />
        <button
          type="button"
          disabled={busy || !body.trim()}
          className="btn-primary mt-3 disabled:opacity-50"
          onClick={() => {
            setBusy(true);
            void createNote({
              kind,
              body,
              title: title || undefined,
              meetingAt: meetingAt ? new Date(meetingAt).toISOString() : undefined,
              // connection/property without target: allow as free meeting-style when kind meeting
              ...(kind === 'connection' || kind === 'property'
                ? {} // still need target — show toast if missing
                : {}),
            })
              .then((r) => {
                announceAward(push, r.award, 'Note saved');
                setBody('');
                setTitle('');
                setMeetingAt('');
                return reload();
              })
              .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : 'Save failed';
                if (/parcelId|personId|leadId/i.test(msg)) {
                  push(
                    'Property/connection notes need a parcel or person — open that page and use the notes panel there.',
                    'info',
                  );
                } else {
                  push(msg, 'danger');
                }
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Saving…' : 'Save note (+8 XP)'}
        </button>
      </section>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      <ul className="space-y-3">
        {items.map((n) => (
          <li key={n.id} className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-brass text-[10px] font-semibold tracking-[0.16em] uppercase">
                  {n.kind}
                </p>
                <p className="font-display mt-1 text-lg font-bold text-white">
                  {n.title || n.parcel?.situsAddress || n.person?.nameRaw || n.event?.name || 'Note'}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-mist">{n.body}</p>
                <p className="text-fog mt-3 text-xs">
                  {formatDate(n.updatedAt)}
                  {n.parcel ? (
                    <>
                      {' · '}
                      <Link
                        to={`/parcels/${encodeURIComponent(n.parcel.pin)}`}
                        className="text-moss"
                      >
                        {n.parcel.situsAddress || n.parcel.pin}
                      </Link>
                    </>
                  ) : null}
                  {n.meetingAt ? ` · meeting ${formatDate(n.meetingAt)}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="text-fog hover:text-danger text-xs"
                onClick={() =>
                  void deleteNote(n.id)
                    .then(() => reload())
                    .catch((err: unknown) =>
                      push(err instanceof Error ? err.message : 'Delete failed', 'danger'),
                    )
                }
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-fog text-sm">No notes in this view yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
