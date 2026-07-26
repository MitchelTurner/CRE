import { useEffect, useState } from 'react';
import { createNote, deleteNote, listNotes } from '../lib/api';
import type { NoteKind, NoteRow } from '../lib/types';
import { announceAward } from '../lib/awards';
import { formatDate } from '../lib/format';
import { useToast } from '../state/toast';

type Props = {
  kind: NoteKind;
  parcelId?: string;
  personId?: string;
  leadId?: string;
  eventId?: string;
  heading?: string;
  placeholder?: string;
};

export function NotesPanel({
  kind,
  parcelId,
  personId,
  leadId,
  eventId,
  heading = 'Notes',
  placeholder = 'What happened? What should you remember next time?',
}: Props) {
  const [items, setItems] = useState<NoteRow[]>([]);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [meetingAt, setMeetingAt] = useState('');
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  async function reload() {
    const res = await listNotes({ kind, parcelId, personId, leadId, eventId });
    setItems(res.items);
  }

  useEffect(() => {
    void reload().catch(() => {
      /* ignore */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, parcelId, personId, leadId, eventId]);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-white">{heading}</h3>
        <span className="text-fog text-[10px] tracking-[0.16em] uppercase">+8 XP each</span>
      </div>
      <p className="text-fog mt-1 text-xs">
        Clear notes help future-you. Keep them short and concrete.
      </p>

      <div className="mt-4 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional title"
          className="field w-full"
        />
        {kind === 'meeting' ? (
          <input
            type="datetime-local"
            value={meetingAt}
            onChange={(e) => setMeetingAt(e.target.value)}
            className="field w-full"
          />
        ) : null}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="field w-full resize-y"
        />
        <button
          type="button"
          disabled={busy || !body.trim()}
          className="btn-primary disabled:opacity-50"
          onClick={() => {
            setBusy(true);
            void createNote({
              kind,
              body,
              title: title || undefined,
              parcelId,
              personId,
              leadId,
              eventId,
              meetingAt: meetingAt ? new Date(meetingAt).toISOString() : undefined,
            })
              .then((r) => {
                announceAward(push, r.award, 'Note saved');
                setBody('');
                setTitle('');
                setMeetingAt('');
                return reload();
              })
              .catch((err: unknown) =>
                push(err instanceof Error ? err.message : 'Could not save note', 'danger'),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Saving…' : 'Save note'}
        </button>
      </div>

      <ul className="mt-5 space-y-3">
        {items.map((n) => (
          <li key={n.id} className="border-pine/40 border-t pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                {n.title ? <p className="text-sm font-semibold text-white">{n.title}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-sm text-mist">{n.body}</p>
                <p className="text-fog mt-2 text-[11px]">
                  {formatDate(n.updatedAt)}
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
          <li className="text-fog text-sm">No notes yet — write the first one.</li>
        ) : null}
      </ul>
    </div>
  );
}
