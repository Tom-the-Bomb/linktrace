import { useMemo, useState } from 'react';

import type { CategoryReport } from '../api';
import { SectionHeader } from './SectionHeader';
import { Pager } from './ui/Pager';
import { TextChip } from './ui/TextChip';

const PAGE_SIZE = 10;

type Filter = 'all' | 'healthy' | 'mixed' | 'rotten';
type SortKey = 'pages' | 'rot' | 'seo';
type SortDir = 'asc' | 'desc';

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

export function Categories({ categories }: { categories: CategoryReport[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('pages');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

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

  const controls = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto sm:justify-end">
      <div className="flex items-center gap-3">
        {(['all', 'healthy', 'mixed', 'rotten'] as Filter[]).map((f) => (
          <TextChip key={f} active={filter === f} onClick={() => setFilterReset(f)}>
            {f}
          </TextChip>
        ))}
      </div>

      <Divider />

      <div className="flex items-center gap-3">
        <SortChip k="pages" label="pages" current={sortKey} dir={sortDir} onPick={pickSort} />
        <SortChip k="rot" label="rot%" current={sortKey} dir={sortDir} onPick={pickSort} />
        <SortChip k="seo" label="seo" current={sortKey} dir={sortDir} onPick={pickSort} />
      </div>

      <Divider />

      <span className="hidden text-xs italic text-ink-300 sm:inline">Where the rot lives.</span>
    </div>
  );

  return (
    <section>
      <SectionHeader number="03" title="By section" right={controls} />

      <ul className="divide-y divide-ink-500/60 border-y border-ink-500/60">
        {paged.map((c, i) => (
          <CategoryRow key={c.category} cat={c} index={start + i} />
        ))}
      </ul>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-6">
          <Pager current={current} pageCount={pageCount} onPage={setPage} />
        </div>
      )}
    </section>
  );
}

function Divider() {
  return (
    <span aria-hidden="true" className="hidden font-mono text-[10px] text-ink-400 sm:inline">
      ·
    </span>
  );
}

// borderless toggle with a direction arrow when active
function SortChip({
  k,
  label,
  current,
  dir,
  onPick,
}: {
  k: SortKey;
  label: string;
  current: SortKey;
  dir: SortDir;
  onPick: (k: SortKey) => void;
}) {
  const active = current === k;
  return (
    <TextChip active={active} onClick={() => onPick(k)}>
      {label}
      {active && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
    </TextChip>
  );
}

const patternStyle: Record<string, { bar: string; chip: string }> = {
  healthy: {
    bar: 'bg-emerald-400',
    chip: 'border-emerald-400/40 bg-emerald-500/5 text-emerald-300',
  },
  mixed: {
    bar: 'bg-accent',
    chip: 'border-accent/40 bg-accent/5 text-accent',
  },
  mostly_rotten: {
    bar: 'bg-rose-400',
    chip: 'border-rose-400/40 bg-rose-500/5 text-rose-300',
  },
  all_rotten: {
    bar: 'bg-rose-500',
    chip: 'border-rose-500/50 bg-rose-600/10 text-rose-300',
  },
  empty: {
    bar: 'bg-ink-500',
    chip: 'border-ink-400/40 bg-ink-700 text-ink-300',
  },
};

function CategoryRow({ cat, index }: { cat: CategoryReport; index: number }) {
  const rotPct = cat.total_pages > 0 ? (cat.rotten_pages / cat.total_pages) * 100 : 0;
  const style = patternStyle[cat.pattern] ?? patternStyle.mixed;

  return (
    <li className="flex items-center gap-4 py-5">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-ink-300">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="display truncate text-xl font-light">{cat.category}</div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-300">
          {cat.total_pages} pages · {cat.rotten_pages} rotten · seo {cat.avg_seo_score}
        </div>
      </div>

      {/* progress bar is supplementary — hidden on mobile so the row never overflows */}
      <div className="hidden w-32 shrink-0 sm:block lg:w-48">
        <div className="h-px w-full overflow-hidden bg-ink-500">
          <div className={`h-full ${style.bar}`} style={{ width: `${rotPct}%` }} />
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink-300">
          rot {Math.round(rotPct)}%
        </div>
      </div>

      <span className={`chip shrink-0 whitespace-nowrap ${style.chip}`}>
        {cat.pattern.replace('_', ' ')}
      </span>
    </li>
  );
}
