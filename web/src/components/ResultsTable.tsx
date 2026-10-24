import { useMemo, useState } from 'react';

import { ArrowDown, ArrowUp, ExternalLink, Search } from 'lucide-react';

import type { PageRow } from '../api';
import { scoreTextColour, sectionOf } from '../lib/colours';
import { Pager } from './ui/Pager';
import { SectionDot } from './ui/SectionDot';
import { SegButton } from './ui/SegButton';
import { StatusChip } from './ui/StatusChip';

type Filter = 'all' | 'healthy' | 'rotten';
type SortKey = 'depth' | 'seo';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;
const FILTER_LABEL: Record<Filter, string> = { all: 'All', healthy: 'Healthy', rotten: 'Broken' };

// every crawled page; row click opens the SEO drawer
export function ResultsTable({
  rows,
  onSelect,
  colourFor,
}: {
  rows: PageRow[];
  onSelect: (url: string) => void;
  colourFor: (section: string) => string;
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
    if (filter === 'rotten') {
      r = r.filter((x) => !x.is_alive);
    } else if (filter === 'healthy') {
      r = r.filter((x) => x.is_alive);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter((x) => x.url.toLowerCase().includes(q));
    }
    return r;
  }, [rows, filter, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'seo') {
        // no-score pages always sink to the bottom, regardless of direction
        if (a.seo_score === null) {
          return b.seo_score === null ? 0 : 1;
        }
        if (b.seo_score === null) {
          return -1;
        }
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

  // click active key flips direction; click another selects it ascending
  function pickSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('asc');
    }
    setPage(1);
  }

  if (rows.length === 0) {
    return null;
  }

  const DirIcon = sortDir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="seg" role="group" aria-label="Filter pages">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <SegButton
              key={f}
              active={filter === f}
              onClick={() => selectFilter(f)}
              count={counts[f]}
            >
              {FILTER_LABEL[f]}
            </SegButton>
          ))}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="field flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5 sm:w-56 sm:flex-none">
            <span className="sr-only">Search pages by URL</span>
            <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search URLs"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
            />
          </label>
          <div className="seg" role="group" aria-label="Sort pages">
            {(['depth', 'seo'] as SortKey[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={sortKey === k}
                onClick={() => pickSort(k)}
                className="seg-btn"
              >
                {k === 'depth' ? 'Depth' : 'SEO'}
                {sortKey === k && (
                  <DirIcon
                    className="size-3.5"
                    strokeWidth={2.5}
                    aria-label={sortDir === 'asc' ? 'ascending' : 'descending'}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {sorted.length === 0 ? (
        <p className="px-6 py-10 text-center text-[15px] text-ink-3">No pages match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-5 sm:pl-8">Page</th>
                <th>Status</th>
                <th className="text-right">Depth</th>
                <th className="text-right">Response</th>
                <th className="text-right">SEO</th>
                <th className="pr-5 sm:pr-8">Archive</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr
                  key={r.url}
                  onClick={() => onSelect(r.url)}
                  onKeyDown={(e) =>
                    (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(r.url))
                  }
                  tabIndex={0}
                  aria-label={`Open audit for ${r.url}`}
                  className="cursor-pointer focus-visible:bg-sunken focus-visible:outline-none"
                >
                  <td className="max-w-[28rem] pl-5 sm:pl-8">
                    <span className="flex items-center gap-2.5" title={r.url}>
                      <SectionDot colour={colourFor(sectionOf(r.url))} className="!size-2.5" />
                      <span className="truncate font-mono text-[13px]">{pathOf(r.url)}</span>
                    </span>
                  </td>
                  <td>
                    <StatusChip alive={r.is_alive} code={r.status_code} error={r.error_type} />
                  </td>
                  <td className="num text-right font-mono text-[13px] text-ink-2">{r.depth}</td>
                  <td className="num whitespace-nowrap text-right font-mono text-[13px] text-ink-2">
                    {r.response_time > 0 ? `${r.response_time.toLocaleString()} ms` : '—'}
                  </td>
                  <td
                    className={`num text-right font-mono text-[13px] font-medium ${scoreTextColour(r.seo_score)}`}
                  >
                    {r.seo_score ?? '—'}
                  </td>
                  <td className="pr-5 sm:pr-8">
                    {r.archive_url ? (
                      <a
                        href={r.archive_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-accent-600 hover:text-accent-700 hover:underline"
                      >
                        Wayback
                        <ExternalLink className="size-3" strokeWidth={2.25} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-[13px] text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5 sm:px-8">
          <span className="num text-[13px] text-ink-3">
            {((current - 1) * PAGE_SIZE + 1).toLocaleString()}–
            {Math.min(current * PAGE_SIZE, sorted.length).toLocaleString()} of{' '}
            {sorted.length.toLocaleString()}
          </span>
          <Pager current={current} pageCount={pageCount} onPage={setPage} />
        </footer>
      )}
    </section>
  );
}

// path + query only; the report header already names the host
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || '/';
  } catch {
    return url;
  }
}
