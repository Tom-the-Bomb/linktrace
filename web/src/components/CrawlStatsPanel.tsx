import type { CrawlStats } from '../api';
import { SectionHeader } from './SectionHeader';
import { StatTile } from './ui/StatTile';

// crawl performance, computed from page_results (no separate telemetry table)
export function CrawlStatsPanel({ stats }: { stats: CrawlStats }) {
  const errorPct = (stats.error_rate * 100).toFixed(1);
  const mins = Math.floor(stats.duration_seconds / 60);
  const secs = stats.duration_seconds % 60;
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <section>
      <SectionHeader number="06" title="Crawl performance" subtitle="How the run went" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile bordered label="pages" value={stats.total_pages} />
        <StatTile bordered label="requests" value={stats.total_requests} hint="incl. retries" />
        <StatTile bordered label="avg response" value={`${stats.avg_response_ms}ms`} />
        <StatTile bordered label="max response" value={`${stats.max_response_ms}ms`} />
        <StatTile
          bordered
          label="error rate"
          value={`${errorPct}%`}
          tone={stats.error_rate > 0.1 ? 'bad' : 'ok'}
        />
        <StatTile bordered label="duration" value={duration} />
      </div>
    </section>
  );
}
