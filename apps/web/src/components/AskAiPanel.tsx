import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { askAnalytics, getAnalyticsStatus } from '../lib/api';

const SUGGESTIONS = [
  'Who should I call first today and why?',
  'What catalysts showed up this week?',
  'Which submarkets look hottest in my queue?',
  'Any upcoming high-density owner events I should prep for?',
];

export function AskAiPanel({
  pin,
  compact = false,
}: {
  pin?: string;
  compact?: boolean;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [cited, setCited] = useState<string[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAnalyticsStatus()
      .then((s) => {
        setReady(s.ready);
        setNote(s.note);
      })
      .catch(() => {
        setReady(false);
        setNote('Could not read AI status');
      });
  }, []);

  async function submit(q: string) {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await askAnalytics(text, pin);
      setAnswer(res.answer);
      setActions(res.suggestedActions ?? []);
      setCited(res.citedPins ?? []);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask AI failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={compact ? 'space-y-3' : 'border-pine/40 space-y-4 border p-5'}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-bold text-white">Ask AI</h3>
          <p className="text-fog mt-1 text-xs">
            Grounded on your inventory, call queue, catalysts, and events — not the open web.
          </p>
        </div>
        {ready === false ? (
          <span className="text-brass text-xs">{note || 'AI off'}</span>
        ) : ready ? (
          <span className="text-moss text-xs">Ready</span>
        ) : null}
      </div>

      {!compact ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || ready === false}
              className="border-pine-soft text-fog hover:border-moss hover:text-moss border px-2 py-1 text-xs disabled:opacity-40"
              onClick={() => void submit(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit(question);
          }}
          placeholder={
            pin ? `Ask about PIN ${pin} or your market…` : 'Ask about your queue, catalysts, market…'
          }
          className="border-pine-soft bg-ink/40 min-w-0 flex-1 border px-3 py-2 text-sm text-white"
          disabled={busy || ready === false}
        />
        <button
          type="button"
          disabled={busy || ready === false || !question.trim()}
          className="bg-moss text-ink hover:bg-moss-dim px-4 py-2 text-sm font-semibold disabled:opacity-50"
          onClick={() => void submit(question)}
        >
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      {error ? <p className="text-danger text-sm">{error}</p> : null}

      {answer ? (
        <div className="space-y-3">
          <p className="whitespace-pre-wrap text-sm text-mist">{answer}</p>
          {actions.length ? (
            <ul className="text-fog list-inside list-disc text-xs">
              {actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
          {cited.length ? (
            <p className="text-fog text-xs">
              Cited:{' '}
              {cited.map((p, i) => (
                <span key={p}>
                  {i ? ' · ' : ''}
                  <Link className="text-moss" to={`/parcels/${encodeURIComponent(p)}`}>
                    {p}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}

      {ready === false ? (
        <p className="text-fog text-xs">
          On Railway set <span className="text-mist">LLM_ENABLED=true</span> and{' '}
          <span className="text-mist">ANTHROPIC_API_KEY</span>, then redeploy.
        </p>
      ) : null}
    </section>
  );
}
