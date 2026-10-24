import { useMemo, useState } from 'react';

import { ArrowDown, ArrowUp } from 'lucide-react';

import type { CategoryReport } from '../api';
import { scoreTextColour } from '../lib/colours';
import { SectionHeader } from './SectionHeader';
import { Pager } from './ui/Pager';
import { SectionDot } from './ui/SectionDot';
import { SegButton } from './ui/SegButton';

const PAGE_SIZE = 10;

type Filter = 'all' | 'healthy' | 'mixed' | 'rotten';
type SortKey = 'pages' | 'rot' | 'seo';
type SortDir = 'asc' | 'desc';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  healthy: 'Links OK',
  mixed: 'Some broken',
  rotten: 'Mostly broken',
};
const SORT_LABEL: Record<SortKey, string> = { pages: 'Pages', rot: 'Broken %', seo: 'SEO' };

function inFilter(pattern: string, filter: Filter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'healthy') {
    return pattern === 'healthy';
  }
  if (filter === 'mixed') {
    return pattern === 'mixed';
  }
  return pattern === 'mostly_rotten' || pattern === 'all_rotten';
}

function rotRatio(c: CategoryReport): number {
  return c.total_pages > 0 ? c.rotten_pages / c.total_pages : 0;
}

// per-key value extractor; comparator reads the active one
const SORT_VALUE: Record<SortKey, (c: CategoryReport) => number> = {
  pages: (c) => c.total_pages,
  rot: rotRatio,
  seo: (c) => c.avg_seo_score,
};

export function Categories({
  categories,
  colourFor,
}: {
  categories: CategoryReport[];
  colourFor: (section: string) => string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('pages');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: categories.length, healthy: 0, mixed: 0, rotten: 0 };
    for (const cat of categories) {
      for (const f of ['healthy', 'mixed', 'rotten'] as Filter[]) {
        if (inFilter(cat.pattern, f)) {
          c[f]++;
        }
      }
    }
    return c;
  }, [categories]);

  const filtered = useMemo(() => {
    let r = categories;
    if (filter !== 'all') {
      r = r.filter((c) => inFilter(c.pattern, filter));
    }
    const value = SORT_VALUE[sortKey];
    return r.slice().sort((a, b) => {
      const diff = value(a) - value(b);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [categories, filter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);

  // controls that mutate the result set reset paging
  function setFilterReset(f: Filter) {
    setFilter(f);
    setPage(1);
  }
  // click active key flips direction; click another sets it (resets to desc)
  function pickSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
    setPage(1);
  }

  const DirIcon = sortDir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <section>
      <SectionHeader
        title="By section"
        subtitle="Pages grouped by the first part of their URL path (like /blog)."
      />

      <div className="panel">
        <div className="panel-head">
          <div className="seg" role="group" aria-label="Filter sections">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <SegButton
                key={f}
                active={filter === f}
                onClick={() => setFilterReset(f)}
                count={counts[f]}
              >
                {FILTER_LABEL[f]}
              </SegButton>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Sort sections">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={sortKey === k}
                onClick={() => pickSort(k)}
                className="seg-btn"
              >
                {SORT_LABEL[k]}
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

        <div
          aria-hidden="true"
          className="hidden grid-cols-[14px_minmax(0,1fr)_170px_64px_118px] gap-x-4 border-b border-line bg-sunken/60 px-6 py-2 text-xs font-semibold text-ink-3 sm:grid"
        >
          <span />
          <span>Section</span>
          <span>Broken pages</span>
          <span className="text-right">SEO</span>
          <span className="text-right">Links</span>
        </div>
        {paged.length === 0 ? (
          <p className="px-6 py-10 text-center text-[15px] text-ink-3">
            No sections match this filter.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {paged.map((c) => (
              <CategoryRow key={c.category} cat={c} colour={colourFor(c.category)} />
            ))}
          </ul>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-2.5 sm:px-8">
            <span className="num text-[13px] text-ink-3">
              {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <Pager current={current} pageCount={pageCount} onPage={setPage} />
          </div>
        )}
      </div>
    </section>
  );
}

// chip says link health in plain words; SEO has its own column
const PATTERN: Record<string, { chip: string; bar: string }> = {
  healthy: { chip: 'chip-ok', bar: 'bg-ok-dot' },
  mixed: { chip: 'chip-warn', bar: 'bg-warn-dot' },
  mostly_rotten: { chip: 'chip-bad', bar: 'bg-bad-dot' },
  all_rotten: { chip: 'chip-bad', bar: 'bg-bad-dot' },
  empty: { chip: 'chip-neutral', bar: 'bg-ink-4' },
};

function linkLabel(cat: CategoryReport): string {
  if (cat.pattern === 'empty') {
    return 'No pages';
  }
  if (cat.rotten_pages === 0) {
    return 'Links OK';
  }
  if (cat.pattern === 'all_rotten') {
    return 'All broken';
  }
  return `${cat.rotten_pages.toLocaleString()} broken`;
}

function CategoryRow({ cat, colour }: { cat: CategoryReport; colour: string }) {
  const rotPct = cat.total_pages > 0 ? Math.round((cat.rotten_pages / cat.total_pages) * 100) : 0;
  const style = PATTERN[cat.pattern] ?? PATTERN.mixed;

  return (
    <li className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3.5 sm:grid-cols-[14px_minmax(0,1fr)_170px_64px_118px] sm:px-8">
      <SectionDot colour={colour} />
      <div className="min-w-0">
        <div className="truncate font-mono text-sm font-medium">{cat.category}</div>
        <div className="num mt-0.5 text-[13px] text-ink-3">
          {cat.total_pages.toLocaleString()} {cat.total_pages === 1 ? 'page' : 'pages'}
          {/* the SEO column is hidden on mobile, so the figure rides in the meta line there */}
          <span className="sm:hidden">
            {' · '}SEO{' '}
            <span className={scoreTextColour(cat.avg_seo_score)}>{cat.avg_seo_score}</span>
          </span>
        </div>
      </div>

      {/* rot bar is supplementary — hidden on mobile so the row never overflows */}
      <div className="hidden items-center gap-2.5 sm:flex" title={`${rotPct}% broken`}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line">
          <div
            className={`h-full rounded-full ${style.bar}`}
            style={{ width: `${Math.max(rotPct, rotPct > 0 ? 4 : 0)}%` }}
          />
        </div>
        <span className="num w-9 text-right font-mono text-[11px] text-ink-3">{rotPct}%</span>
      </div>

      <span
        className={`num hidden text-right font-mono text-[13px] font-medium sm:block ${scoreTextColour(cat.avg_seo_score)}`}
      >
        <span className="sr-only">SEO </span>
        {cat.avg_seo_score}
      </span>

      <span className={`chip justify-self-end ${style.chip}`}>{linkLabel(cat)}</span>
    </li>
  );
}
