import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProgress } from '../lib/api';
import type { ProgressSummary } from '../lib/types';

export function QuestsPage() {
  const [data, setData] = useState<ProgressSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getProgress()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load progress'),
      );
  }, []);

  if (error) return <p className="text-danger text-sm">{error}</p>;
  if (!data) return <p className="text-fog animate-fade text-sm">Loading quests…</p>;

  return (
    <div className="animate-rise space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-moss text-xs font-semibold tracking-[0.22em] uppercase">Playbook</p>
          <h2 className="font-display mt-2 text-4xl font-bold tracking-tight text-white">
            Quests & rewards
          </h2>
          <p className="text-fog mt-2 max-w-xl text-sm">
            Clear targets. Predictable XP. Badges unlock when you hit the number — no surprises.
          </p>
        </div>
        <div className="glass rounded-2xl px-5 py-4">
          <p className="text-fog text-xs tracking-[0.16em] uppercase">Level {data.level}</p>
          <p className="font-display text-3xl font-bold text-white">{data.xp} XP</p>
          <p className="text-brass mt-1 text-xs font-semibold">
            {data.streakDays}-day streak
          </p>
          <div className="bg-ink/60 mt-3 h-2 overflow-hidden rounded-full">
            <div className="xp-fill bg-moss h-full rounded-full" style={{ width: `${data.pct}%` }} />
          </div>
          <p className="text-fog mt-1 text-[11px]">
            {data.intoLevel} / {data.needForNext} to level {data.level + 1}
          </p>
        </div>
      </div>

      <section>
        <h3 className="font-display text-xl font-bold text-white">Today&apos;s quests</h3>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {data.quests.map((q) => (
            <li
              key={q.id}
              className={[
                'glass rounded-2xl p-4 transition',
                q.done ? 'border-moss/40' : '',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-white">{q.title}</p>
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                    q.done ? 'bg-moss/20 text-moss' : 'bg-ink/50 text-fog',
                  ].join(' ')}
                >
                  {q.done ? 'Done' : `${q.current}/${q.target}`}
                </span>
              </div>
              <div className="bg-ink/60 mt-3 h-1.5 overflow-hidden rounded-full">
                <div
                  className="score-fill bg-moss h-full rounded-full"
                  style={{ width: `${q.pct}%` }}
                />
              </div>
              <p className="text-fog mt-2 text-xs">{q.xpHint}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/pipeline" className="btn-primary">
            Open call queue
          </Link>
          <Link to="/events" className="btn-ghost">
            Events
          </Link>
          <Link to="/notes" className="btn-ghost">
            Notes
          </Link>
        </div>
      </section>

      <section>
        <h3 className="font-display text-xl font-bold text-white">How you earn XP</h3>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data.rewards).map(([action, xp]) => (
            <li key={action} className="glass flex items-center justify-between rounded-xl px-3 py-2">
              <span className="text-sm text-mist">{labelAction(action)}</span>
              <span className="text-moss text-sm font-bold">+{xp}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-xl font-bold text-white">Badges</h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.badges.catalog.map((b) => (
            <li
              key={b.id}
              className={[
                'rounded-2xl p-4',
                b.earned ? 'glass border-moss/35' : 'border-pine/30 border bg-ink/20 opacity-70',
              ].join(' ')}
            >
              <p className="text-sm font-bold text-white">
                {b.earned ? '★ ' : ''}
                {b.name}
              </p>
              <p className="text-fog mt-1 text-xs">{b.description}</p>
              <p className="text-brass mt-3 text-[11px] tracking-wide uppercase">{b.how}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-xl font-bold text-white">Recent XP</h3>
        <ul className="divide-pine/30 mt-3 divide-y">
          {data.recent.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-mist">{labelAction(r.action)}</span>
              <span className="text-moss font-semibold">+{r.xpDelta}</span>
            </li>
          ))}
          {data.recent.length === 0 ? (
            <li className="text-fog py-4 text-sm">No XP yet — log a call outcome to start.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function labelAction(action: string) {
  return action.replace(/_/g, ' ');
}
