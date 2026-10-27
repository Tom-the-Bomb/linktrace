import { useMemo, useState } from 'react';

import { ArrowDown, ArrowUp } from 'lucide-react';

import type { CategoryReport } from '../api';
import { usePagination } from '../hooks/usePagination';
import { pct, scoreTextColour } from '../lib/colours';
import { SectionHeader } from './SectionHeader';
import { Pager } from './ui/Pager';
import { SectionDot } from './ui/SectionDot';
import { Badge, type BadgeVariant } from './ui/badge';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

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

const SORT_VALUE: Record<SortKey, (c: CategoryReport) => number> = {
  pages: (c) => c.total_pages,
  rot: (c) => (c.total_pages > 0 ? c.rotten_pages / c.total_pages : 0),
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

  const { page, setPage, paged } = usePagination(filtered, PAGE_SIZE);

  function pickFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }
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
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && pickFilter(v as Filter)}
            aria-label="Filter sections"
          >
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <ToggleGroupItem
                key={f}
                value={f}
                count={categories.filter((c) => inFilter(c.pattern, f)).length}
              >
                {FILTER_LABEL[f]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {/* clicking the active key again flips the direction */}
          <ToggleGroup
            type="single"
            value={sortKey}
            onValueChange={(v) => pickSort((v || sortKey) as SortKey)}
            aria-label="Sort sections"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <ToggleGroupItem key={k} value={k}>
                {SORT_LABEL[k]}
                {sortKey === k && (
                  <DirIcon
                    className="size-3.5"
                    strokeWidth={2.5}
                    aria-label={sortDir === 'asc' ? 'ascending' : 'descending'}
                  />
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div
          aria-hidden="true"
          className="bg-sunken/60 text-ink-3 hidden grid-cols-[14px_minmax(0,1fr)_170px_64px_118px] gap-x-4 border-b px-8 py-2 text-xs font-medium sm:grid"
        >
          <span />
          <span>Section</span>
          <span>Broken pages</span>
          <span className="text-right">SEO</span>
          <span className="text-right">Links</span>
        </div>
        {paged.length === 0 ? (
          <p className="text-ink-3 text-body px-6 py-10 text-center">
            No sections match this filter.
          </p>
        ) : (
          <ul className="divide-y">
            {paged.map((c) => (
              <CategoryRow key={c.category} cat={c} colour={colourFor(c.category)} />
            ))}
          </ul>
        )}

        <Pager page={page} total={filtered.length} size={PAGE_SIZE} onPage={setPage} />
      </div>
    </section>
  );
}

const PATTERN: Record<string, { tone: BadgeVariant; bar: string }> = {
  healthy: { tone: 'ok', bar: 'bg-ok-dot' },
  mixed: { tone: 'warn', bar: 'bg-warn-dot' },
  mostly_rotten: { tone: 'bad', bar: 'bg-bad-dot' },
  all_rotten: { tone: 'bad', bar: 'bg-bad-dot' },
  empty: { tone: 'neutral', bar: 'bg-ink-4' },
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
  const rotPct = pct(cat.rotten_pages, cat.total_pages);
  const style = PATTERN[cat.pattern] ?? PATTERN.mixed;

  return (
    <li className="gutter grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-4 py-3.5 sm:grid-cols-[14px_minmax(0,1fr)_170px_64px_118px]">
      <SectionDot colour={colour} />
      <div className="min-w-0">
        <div className="truncate font-mono text-sm font-medium">{cat.category}</div>
        <div className="num text-ink-3 text-label mt-0.5">
          {cat.total_pages.toLocaleString()} {cat.total_pages === 1 ? 'page' : 'pages'}
          <span className="sm:hidden">
            {', '}SEO{' '}
            <span className={scoreTextColour(cat.avg_seo_score)}>{cat.avg_seo_score}</span>
          </span>
        </div>
      </div>

      <div className="hidden items-center gap-2.5 sm:flex" title={`${rotPct}% broken`}>
        <div className="bg-sunken ring-line h-1.5 flex-1 overflow-hidden rounded-full ring-1 forced-color-adjust-none ring-inset">
          <div
            className={`h-full rounded-full ${style.bar}`}
            style={{ width: `${Math.max(rotPct, rotPct > 0 ? 4 : 0)}%` }}
          />
        </div>
        <span className="num text-ink-3 text-code w-9 text-right font-mono">{rotPct}%</span>
      </div>

      <span
        className={`num text-label hidden text-right font-mono font-medium sm:block ${scoreTextColour(cat.avg_seo_score)}`}
      >
        <span className="sr-only">SEO </span>
        {cat.avg_seo_score}
      </span>

      <Badge variant={style.tone} className="justify-self-end">
        {linkLabel(cat)}
      </Badge>
    </li>
  );
}
