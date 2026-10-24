import { TriangleAlert } from 'lucide-react';

import type { Report } from '../api';
import { pct, scoreTierChip } from '../lib/colours';
import { SectionHeader } from './SectionHeader';

// the two numbers that matter, side by side, then the recurring issues
export function OverallReport({ report }: { report: Report }) {
  const { total_pages, rotten, avg_seo_score, top_issues } = report.overall;
  const tier = scoreTierChip(avg_seo_score);
  const rottenPct = pct(rotten, total_pages);

  return (
    <section>
      <SectionHeader title="Summary" />
      <div className="panel grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="p-5 sm:p-8">
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div>
              <p className="text-[13px] font-medium text-ink-3">Broken pages</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                <span
                  className={`num text-7xl font-semibold tracking-[-0.05em] ${rotten > 0 ? 'text-bad-fg' : 'text-ok-fg'}`}
                >
                  {rotten.toLocaleString()}
                </span>
                <span className="num text-xl font-semibold text-ink-3">
                  of {total_pages.toLocaleString()}
                </span>
              </p>
              <BrokenBar pct={rottenPct} />
              <p className="mt-1.5 text-[13px] text-ink-3">
                {rotten === 0 ? (
                  'No broken pages'
                ) : (
                  <>
                    <span className="num font-mono text-[12px]">
                      {rottenPct < 1 ? '<1' : rottenPct}%
                    </span>{' '}
                    of checked pages
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-[13px] font-medium text-ink-3">Average SEO score</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                <span className="num text-7xl font-semibold tracking-[-0.05em]">
                  {avg_seo_score}
                </span>
                <span className="text-xl font-semibold text-ink-3">/100</span>
                <span className={`chip ml-1 self-center ${tier.chip}`}>{tier.label}</span>
              </p>
              <ScoreScale score={avg_seo_score} />
            </div>
          </div>
          <p className="mt-6 border-t border-line pt-5 text-[17px] font-semibold leading-snug tracking-tight">
            <span>{linkVerdict(rotten, rottenPct)}</span>{' '}
            <span className="font-normal text-ink-2">{scoreVerdict(avg_seo_score)}</span>
          </p>
        </div>

        <div className="border-t border-line bg-sunken/50 p-5 sm:p-8 lg:border-l lg:border-t-0">
          <h3 className="text-[15px] font-bold tracking-tight">Most common SEO issues</h3>
          {top_issues.length === 0 ? (
            <p className="mt-3 text-[15px] text-ink-2">No recurring issues found.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {top_issues.map((iss) => (
                <li key={iss} className="flex items-start gap-3 py-2.5 text-[15px] leading-snug">
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-warn-dot"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                  <span>{iss}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function BrokenBar({ pct: p }: { pct: number }) {
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-ok-dot/80" aria-hidden="true">
      <div className="h-full bg-bad-dot" style={{ width: `${p > 0 ? Math.max(p, 1.5) : 0}%` }} />
    </div>
  );
}

// 0-100 track split at the tier thresholds, with a marker at the score
export function ScoreScale({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="mt-4" aria-hidden="true">
      <div className="relative">
        <div className="flex h-2 gap-[3px]">
          <span className="h-full w-1/2 rounded-l-full bg-bad-dot/80" />
          <span className="h-full w-[30%] bg-warn-dot/80" />
          <span className="h-full w-[20%] rounded-r-full bg-ok-dot/80" />
        </div>
        <span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-panel shadow-control ring-2 ring-ink"
          style={{ left: `${clamped}%` }}
        />
      </div>
      <div className="num relative mt-1.5 h-3 font-mono text-[10px] text-ink-3">
        <span className="absolute left-0">0</span>
        <span className="absolute left-1/2 -translate-x-1/2">50</span>
        <span className="absolute left-[80%] -translate-x-1/2">80</span>
      </div>
    </div>
  );
}

// the verdict weighs the broken count first; a broken page is the more urgent fix
function linkVerdict(rotten: number, rottenPct: number) {
  if (rotten === 0) {
    return 'No pages are broken.';
  }
  const pages = `${rotten.toLocaleString()} ${rotten === 1 ? 'page is' : 'pages are'} broken`;
  if (rottenPct < 1) {
    return `${pages} (under 1% of the site).`;
  }
  if (rottenPct < 5) {
    return `${pages} (${rottenPct}% of the site).`;
  }
  return `${pages} (${rottenPct}% of the site), so they're worth fixing first.`;
}

function scoreVerdict(s: number) {
  if (s >= 85) {
    return 'Most pages have the SEO basics in place.';
  }
  if (s >= 65) {
    return 'SEO is decent, and fixing a few recurring issues would raise the score noticeably.';
  }
  if (s >= 40) {
    return 'SEO is mixed, with several pages needing work before search engines will read them well.';
  }
  return 'SEO is weak, since basic tags are missing from most of the site.';
}
