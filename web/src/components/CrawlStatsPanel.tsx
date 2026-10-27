import type { CrawlStats } from '../api';
import { SectionHeader } from './SectionHeader';

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
      <dl className="panel grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 xl:divide-x max-xl:[&>div]:border-b">
        {items.map((it) => (
          <div key={it.label} className="gutter py-5">
            <dt className="text-ink-3 text-label font-medium">{it.label}</dt>
            <dd
              className={`num mt-1 text-xl font-semibold tracking-tight ${it.bad ? 'text-bad-fg' : ''}`}
            >
              {it.value}
            </dd>
            {it.hint && <dd className="text-ink-3 text-xs">{it.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
