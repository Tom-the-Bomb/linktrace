import type { CrawlStats } from '../api';
import { SectionHeader } from './SectionHeader';

// crawl performance, computed from page_results (no separate telemetry table)
export function CrawlStatsPanel({ stats }: { stats: CrawlStats }) {
  const errorPct = (stats.error_rate * 100).toFixed(1);
  const mins = Math.floor(stats.duration_seconds / 60);
  const secs = stats.duration_seconds % 60;
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const items: { label: string; value: string; hint?: string; bad?: boolean }[] = [
    { label: 'Pages', value: stats.total_pages.toLocaleString() },
    { label: 'Requests', value: stats.total_requests.toLocaleString(), hint: 'incl. retries' },
    { label: 'Avg response', value: `${stats.avg_response_ms.toLocaleString()} ms` },
    { label: 'Slowest response', value: `${stats.max_response_ms.toLocaleString()} ms` },
    { label: 'Error rate', value: `${errorPct}%`, bad: stats.error_rate > 0.1 },
    { label: 'Duration', value: duration },
  ];

  return (
    <section>
      <SectionHeader title="Crawl stats" />
      <dl className="panel grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x [&>div]:border-line max-lg:[&>div]:border-b">
        {items.map((it) => (
          <div key={it.label} className="px-5 py-5 sm:px-8">
            <dt className="text-[13px] font-medium text-ink-3">{it.label}</dt>
            <dd
              className={`num mt-1 text-xl font-bold tracking-[-0.02em] ${it.bad ? 'text-bad-fg' : ''}`}
            >
              {it.value}
            </dd>
            {it.hint && <dd className="text-xs text-ink-3">{it.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
