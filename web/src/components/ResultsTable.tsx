import { useMemo, useState } from 'react';

import type { PageRow } from '../api';
import { scoreTextColour } from '../lib/colours';

type Filter = 'all' | 'rotten' | 'healthy';

const PAGE_SIZE = 50;

// Flat hairline table. Clicking a row opens the SEO drawer.
export function ResultsTable({
  rows,
  onSelect,
}: {
  rows: PageRow[];
  onSelect: (url: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const rotten = rows.filter((r) => !r.is_alive).length;
    return { all: rows.length, healthy: rows.length - rotten, rotten };
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'rotten') return rows.filter((r) => !r.is_alive);
    return rows.filter((r) => r.is_alive);
  }, [rows, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [filtered, current],
  );

  // Reset to the first page whenever the filter changes the result set.
  function selectFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  if (rows.length === 0) return null;

  return (
    <section className="border border-ink-500/70 bg-ink-700/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-500/70 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
            pages
          </span>
          <span className="display text-2xl font-light tabular-nums">{rows.length}</span>
        </div>
        <div className="flex">
          {(['all', 'healthy', 'rotten'] as Filter[]).map((f) => (
            <FilterChip
              key={f}
              active={filter === f}
              onClick={() => selectFilter(f)}
              label={f}
              count={counts[f]}
            />
          ))}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="pl-6">url</th>
              <th>status</th>
              <th>depth</th>
              <th>resp</th>
              <th>seo</th>
              <th className="pr-6">archive</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.url} onClick={() => onSelect(r.url)} className="cursor-pointer">
                <td className="max-w-md truncate pl-6">
                  <span className="font-mono text-xs text-paper">{r.url}</span>
                </td>
                <td>
                  <StatusBadge alive={r.is_alive} code={r.status_code} error={r.error_type} />
                </td>
                <td className="font-mono text-xs text-ink-300">{r.depth}</td>
                <td className="font-mono text-xs text-ink-300">
                  {r.response_time > 0 ? `${r.response_time}ms` : '—'}
                </td>
                <td>
                  <SeoScore score={r.seo_score} />
                </td>
                <td className="pr-6">
                  {r.archive_url ? (
                    <a
                      href={r.archive_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-[11px] uppercase tracking-widest text-accent hover:text-accent-soft"
                    >
                      wayback ↗
                    </a>
                  ) : (
                    <span className="text-xs text-ink-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <footer className="flex items-center justify-between gap-3 border-t border-ink-500/70 px-6 py-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
            {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div className="flex items-center gap-5">
            <PageButton onClick={() => setPage(current - 1)} disabled={current <= 1}>
              ← prev
            </PageButton>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
              {current} / {pageCount}
            </span>
            <PageButton onClick={() => setPage(current + 1)} disabled={current >= pageCount}>
              next →
            </PageButton>
          </div>
        </footer>
      )}
    </section>
  );
}

function PageButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="border border-ink-500/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:bg-ink-600/40 hover:text-paper disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-300"
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-baseline gap-1.5 border border-ink-500/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition first:border-r-0 last:border-l-0 ${
        active ? 'bg-accent text-ink-900' : 'text-ink-300 hover:bg-ink-600/40 hover:text-paper'
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-60">{count}</span>
    </button>
  );
}

function StatusBadge({ alive, code, error }: { alive: boolean; code: number; error: string }) {
  if (alive) {
    return (
      <span className="chip border-emerald-400/30 bg-emerald-500/5 text-emerald-300">
        <Dot tone="emerald" />
        <span className="font-mono uppercase tracking-widest">{code || 200}</span>
      </span>
    );
  }
  return (
    <span className="chip border-rose-400/30 bg-rose-500/5 text-rose-300">
      <Dot tone="rose" />
      <span className="font-mono uppercase tracking-widest">{error || `http_${code}`}</span>
    </span>
  );
}

function SeoScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-ink-400">—</span>;
  return (
    <span className={`display text-lg font-light tabular-nums ${scoreTextColour(score)}`}>
      {score}
    </span>
  );
}

function Dot({ tone }: { tone: 'emerald' | 'rose' }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        tone === 'emerald' ? 'bg-emerald-400' : 'bg-rose-400'
      }`}
    />
  );
}
