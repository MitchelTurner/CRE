import { Link } from 'react-router-dom';
import type { ProgressSummary } from '../lib/types';

export function XpHud({ progress }: { progress: ProgressSummary | null }) {
  if (!progress) {
    return (
      <div className="glass animate-pulse rounded-2xl px-3 py-2">
        <p className="text-fog text-xs">Loading XP…</p>
      </div>
    );
  }

  const doneQuests = progress.quests.filter((q) => q.done).length;

  return (
    <Link
      to="/quests"
      className="glass group hover:border-moss/40 block min-w-[200px] rounded-2xl px-3 py-2 transition"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-sm font-bold text-white">
          Lv {progress.level}
          <span className="text-moss ml-2 text-xs font-semibold tracking-wide">
            {progress.xp} XP
          </span>
        </p>
        <p className="text-brass text-[10px] font-semibold tracking-[0.14em] uppercase">
          {progress.streakDays}d streak
        </p>
      </div>
      <div className="bg-ink/60 mt-2 h-1.5 overflow-hidden rounded-full">
        <div
          className="xp-fill bg-moss h-full rounded-full"
          style={{ width: `${progress.pct}%` }}
        />
      </div>
      <p className="text-fog mt-1.5 text-[11px]">
        {progress.intoLevel}/{progress.needForNext} to next level · {doneQuests}/
        {progress.quests.length} quests
      </p>
    </Link>
  );
}
