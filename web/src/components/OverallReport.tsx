import { TriangleAlert } from 'lucide-react';

import type { Report } from '../api';
import { pct, scoreTierBadge } from '../lib/colours';
import { SectionHeader } from './SectionHeader';
import { ScoreScale } from './ui/ScoreScale';
import { Badge } from './ui/badge';

export function OverallReport({ report }: { report: Report }) {
  const { total_pages, rotten, avg_seo_score, top_issues } = report.overall;
  const tier = scoreTierBadge(avg_seo_score);
  const rottenPct = pct(rotten, total_pages);

  return (
    <section>
      <SectionHeader title="Summary" />
      <div className="panel grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="p-5 sm:p-8">
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div>
              <p className="text-ink-3 text-label font-medium">Broken pages</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                <span
                  className={`tracking-display text-stat font-semibold tabular-nums ${rotten > 0 ? 'text-bad-fg' : 'text-ok-fg'}`}
                >
                  {rotten.toLocaleString()}
                </span>
                <span className="text-ink-3 text-xl font-semibold tabular-nums">
                  of {total_pages.toLocaleString()}
                </span>
              </p>
              <BrokenBar pct={rottenPct} />
              <p className="text-ink-3 text-label mt-1.5">
                {rotten === 0 ? (
                  'No broken pages'
                ) : (
                  <>
                    <span className="text-caption font-mono">
                      {rottenPct < 1 ? '<1' : rottenPct}%
                    </span>{' '}
                    of checked pages
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-ink-3 text-label font-medium">Average SEO score</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                <span className="tracking-display text-stat font-semibold tabular-nums">
                  {avg_seo_score}
                </span>
                <span className="text-ink-3 text-xl font-semibold">/100</span>
                <Badge variant={tier.tone} className="ml-1 self-center">
                  {tier.label}
                </Badge>
              </p>
              <ScoreScale score={avg_seo_score} />
            </div>
          </div>
          <p className="text-lead mt-6 border-t pt-5 leading-snug font-semibold tracking-tight">
            <span>{linkVerdict(rotten, rottenPct)}</span>{' '}
            <span className="text-ink-2 font-normal">{scoreVerdict(avg_seo_score)}</span>
          </p>
        </div>

        <div className="bg-sunken/50 border-t p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <h3 className="text-body font-semibold tracking-tight">Most common SEO issues</h3>
          {top_issues.length === 0 ? (
            <p className="text-ink-2 text-body mt-3">No recurring issues found.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {top_issues.map((iss) => (
                <li key={iss} className="text-body flex items-start gap-3 py-2.5 leading-snug">
                  <TriangleAlert
                    className="text-warn-dot mt-0.5 size-4 shrink-0"
                    strokeWidth={2.25}
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
    <div
      className="bg-ok-dot/80 mt-4 h-2 overflow-hidden rounded-full forced-color-adjust-none"
      aria-hidden="true"
    >
      <div
        className="bg-bad-dot ease-out-expo h-full transition-[width] duration-700"
        style={{ width: `${p > 0 ? Math.max(p, 1.5) : 0}%` }}
      />
    </div>
  );
}

function linkVerdict(rotten: number, rottenPct: number) {
  if (rotten === 0) {
    return 'No pages are broken.';
  }
  const pages = `${rotten.toLocaleString()} ${rotten === 1 ? 'page is' : 'pages are'} broken`;
  if (rottenPct < 1) {
    return `${pages} (under 1% of the site).`;
  }
  return `${pages} (${rottenPct}% of the site).`;
}

function scoreVerdict(s: number) {
  if (s >= 85) {
    return 'Most pages have the SEO basics in place.';
  }
  if (s >= 65) {
    return 'SEO is decent, and fixing a few recurring issues would raise the score.';
  }
  if (s >= 40) {
    return 'SEO is mixed, and several pages need work.';
  }
  return 'SEO is weak, since basic tags are missing from most of the site.';
}
