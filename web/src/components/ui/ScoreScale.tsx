// 0-100 track split at the tier thresholds, with a marker at the score
export function ScoreScale({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="mt-4" aria-hidden="true">
      {/* the 3px gaps are centred on 50 and 80, so the tier edges sit exactly over their labels */}
      <div className="relative h-2">
        <span className="bg-bad-dot/80 absolute inset-y-0 right-[calc(50%+1.5px)] left-0 rounded-l-full" />
        <span className="bg-warn-dot/80 absolute inset-y-0 right-[calc(20%+1.5px)] left-[calc(50%+1.5px)]" />
        <span className="bg-ok-dot/80 absolute inset-y-0 right-0 left-[calc(80%+1.5px)] rounded-r-full" />
        <span
          className="bg-ink absolute top-1/2 h-4.5 w-0.75 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
          style={{ left: `${clamped}%` }}
        />
      </div>
      <div className="num text-ink-3 relative mt-1.5 h-3 font-mono text-[10px]">
        <span className="absolute left-0">0</span>
        <span className="absolute left-1/2 -translate-x-1/2">50</span>
        <span className="absolute left-[80%] -translate-x-1/2">80</span>
      </div>
    </div>
  );
}
