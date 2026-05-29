import type { CrawlStats } from '../api';
import { type Tone, toneColour } from '../lib/colours';
import { SectionHeader } from './SectionHeader';

// Crawl performance numbers, computed from page_results (no separate telemetry table).
export function CrawlStatsPanel({ stats }: { stats: CrawlStats }) {
  const errorPct = (stats.error_rate * 100).toFixed(1);
  const mins = Math.floor(stats.duration_seconds / 60);
  const secs = stats.duration_seconds % 60;
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <section>
      <SectionHeader number="06" title="Crawl performance" subtitle="How the run went" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="pages" value={stats.total_pages} />
        <Tile label="requests" value={stats.total_requests} hint="incl. retries" />
        <Tile label="avg response" value={`${stats.avg_response_ms}ms`} />
        <Tile label="max response" value={`${stats.max_response_ms}ms`} />
        <Tile
          label="error rate"
          value={`${errorPct}%`}
          tone={stats.error_rate > 0.1 ? 'bad' : 'ok'}
        />
        <Tile label="duration" value={duration} />
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="border border-ink-500/60 bg-ink-700/30 p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-300">{label}</div>
      <div className={`display mt-2 text-2xl font-medium tabular-nums ${toneColour(tone)}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 font-mono text-[10px] tracking-wide text-ink-400">{hint}</div>
      )}
    </div>
  );
}
