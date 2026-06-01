import type { Report } from '../api';
import { scoreStrokeColour, scoreTextColour } from '../lib/colours';
import { SectionHeader } from './SectionHeader';
import { StatTile } from './ui/StatTile';

// gauge + headline metric left, stats + issues right
export function OverallReport({ report }: { report: Report }) {
  const { total_pages, healthy, rotten, avg_seo_score } = report.overall;
  const top_issues = report.overall.top_issues;
  const rottenPct = total_pages > 0 ? Math.round((rotten / total_pages) * 100) : 0;
  const healthyPct = total_pages > 0 ? Math.round((healthy / total_pages) * 100) : 0;

  return (
    <section>
      <SectionHeader
        number="02"
        title="The verdict"
        subtitle="Score, totals, recurring problems."
      />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
        {/* featured score + verdict */}
        <div className="lg:col-span-7">
          <div className="flex items-center gap-10">
            <ScoreGauge score={avg_seo_score} />
            <div>
              <span className="eyebrow">avg SEO score</span>
              <p className="display mt-4 text-2xl font-light leading-snug">
                {scoreVerdict(avg_seo_score)}
              </p>
            </div>
          </div>

          <div className="hairline mt-10 grid grid-cols-3 gap-4 pt-8">
            <StatTile label="pages" value={total_pages} />
            <StatTile label="healthy" value={`${healthy}`} hint={`${healthyPct}%`} tone="ok" />
            <StatTile label="rotten" value={`${rotten}`} hint={`${rottenPct}%`} tone="bad" />
          </div>
        </div>

        {/* recurring issues column */}
        <aside className="border-l border-ink-500/60 lg:col-span-5 lg:pl-10">
          <span className="eyebrow">recurring issues</span>
          {top_issues.length === 0 ? (
            <p className="mt-6 font-mono text-xs text-ink-300">No recurring issues detected.</p>
          ) : (
            <ol className="mt-6 space-y-3">
              {top_issues.map((iss, i) => (
                <li key={iss} className="flex items-baseline gap-4">
                  <span className="display text-xl font-light text-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm leading-relaxed text-paper/90">{iss}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  );
}

function scoreVerdict(s: number) {
  if (s >= 85) return 'Strong. The basics are in place across most pages.';
  if (s >= 65) return 'Decent. A handful of recurring fixes would lift this site significantly.';
  if (s >= 40) return 'Mixed. Several pages need real work before they read well to search.';
  return 'Rough. Foundational SEO is missing across the site.';
}

function ScoreGauge({ score }: { score: number }) {
  const size = 180;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * c;

  const strokeColour = scoreStrokeColour(score);
  const fill = scoreTextColour(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-ink-500"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          className={`${strokeColour} transition-[stroke-dasharray] duration-700`}
        />
        {/* tick marks every 10% */}
        {Array.from({ length: 20 }).map((_, i) => {
          const a = (i / 20) * Math.PI * 2;
          const x1 = size / 2 + Math.cos(a) * (r - 8);
          const y1 = size / 2 + Math.sin(a) * (r - 8);
          const x2 = size / 2 + Math.cos(a) * (r - 14);
          const y2 = size / 2 + Math.sin(a) * (r - 14);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={1}
              className="stroke-ink-500"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`display text-6xl font-light tabular-nums ${fill}`}>{score}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">/ 100</span>
      </div>
    </div>
  );
}
