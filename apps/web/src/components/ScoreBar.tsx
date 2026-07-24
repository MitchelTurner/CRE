export function ScoreBar({ score, large = false }: { score: number | null; large?: boolean }) {
  const value = score ?? 0;
  const width = Math.min(100, Math.max(0, value));
  return (
    <div className={large ? 'min-w-36' : 'min-w-20'}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={`font-display font-bold text-white ${large ? 'text-3xl' : 'text-base'}`}>
          {score ?? '—'}
        </span>
        {large ? <span className="text-fog text-xs tracking-wide uppercase">Score</span> : null}
      </div>
      <div className="bg-pine/50 h-1.5 w-full overflow-hidden">
        <div
          className="score-fill bg-moss h-full"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}