import { useMemo, useState } from 'react';

import { ArrowDown, ArrowUp, Search } from 'lucide-react';

import type { PageRow } from '../api';
import { scoreTextColour } from '../lib/colours';
import { Pager } from './ui/Pager';
import { SegButton } from './ui/SegButton';

type Filter = 'all' | 'rotten' | 'healthy';
type SortKey = 'depth' | 'seo';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

// flat hairline table; row click opens the SEO drawer
export function ResultsTable({
  rows,
  onSelect,
}: {
  rows: PageRow[];
  onSelect: (url: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('depth');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const rotten = rows.filter((r) => !r.is_alive).length;
    return { all: rows.length, healthy: rows.length - rotten, rotten };
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === 'rotten') r = r.filter((x) => !x.is_alive);
    else if (filter === 'healthy') r = r.filter((x) => x.is_alive);
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((x) => x.url.toLowerCase().includes(q));
    return r;
  }, [rows, filter, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'seo') {
        // no-score pages always sink to the bottom, regardless of direction
        if (a.seo_score === null) return b.seo_score === null ? 0 : 1;
        if (b.seo_score === null) return -1;
        return (a.seo_score - b.seo_score) * dir;
      }
      return (a.depth - b.depth) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = useMemo(
    () => sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [sorted, current],
  );

  // reset to page 1 when filter/search/sort changes the result set
  function selectFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  function onQueryChange(v: string) {
    setQuery(v);
    setPage(1);
  }

  function selectSort(key: SortKey) {
    setSortKey(key);
    setPage(1);
  }

  function toggleDir() {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
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
        <div className="flex flex-1 flex-wrap items-center justify-start gap-3 sm:justify-end">
          <div className="relative w-full max-w-xs sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="search endpoint"
              className="w-full border border-ink-500/70 bg-ink-800 py-1.5 pl-9 pr-3 font-mono text-xs text-paper placeholder:text-ink-400 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center">
            <span className="mr-2 font-mono text-[10px] uppercase tracking-widest text-ink-300">
              sort
            </span>
            {(['depth', 'seo'] as SortKey[]).map((k) => (
              <SegButton key={k} variant="sort" active={sortKey === k} onClick={() => selectSort(k)}>
                {k}
              </SegButton>
            ))}
            <button
              onClick={toggleDir}
              aria-label={sortDir === 'asc' ? 'sort ascending' : 'sort descending'}
              className="-ml-px border border-ink-500/70 px-2 py-1.5 text-ink-300 transition hover:bg-ink-600/40 hover:text-paper"
            >
              {sortDir === 'asc' ? (
                <ArrowUp className="size-3.5" aria-hidden="true" />
              ) : (
                <ArrowDown className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="flex">
            {(['all', 'healthy', 'rotten'] as Filter[]).map((f) => (
              <SegButton
                key={f}
                active={filter === f}
                onClick={() => selectFilter(f)}
                count={counts[f]}
              >
                {f}
              </SegButton>
            ))}
          </div>
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
            {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <div className="flex items-center gap-5">
            <Pager bordered current={current} pageCount={pageCount} onPage={setPage} />
          </div>
        </footer>
      )}
    </section>
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
