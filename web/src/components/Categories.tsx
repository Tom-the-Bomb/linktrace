import { useMemo, useState } from 'react';

import type { CategoryReport } from '../api';
import { SectionHeader } from './SectionHeader';

const PAGE_SIZE = 10;

type Filter = 'all' | 'healthy' | 'mixed' | 'rotten';
type SortKey = 'pages' | 'rot' | 'seo';
type SortDir = 'asc' | 'desc';

// pattern bucket -> what the "rotten" filter chip should include
function inFilter(pattern: string, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'healthy') return pattern === 'healthy';
  if (filter === 'mixed') return pattern === 'mixed';
  return pattern === 'mostly_rotten' || pattern === 'all_rotten';
}

function rotRatio(c: CategoryReport): number {
  return c.total_pages > 0 ? c.rotten_pages / c.total_pages : 0;
}

// Per-category breakdown rendered as a wide list, each row sized to read at a glance.
export function Categories({ categories }: { categories: CategoryReport[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('pages');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let r = categories;
    if (filter !== 'all') r = r.filter((c) => inFilter(c.pattern, filter));
    const sorted = r.slice().sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (sortKey === 'pages') {
        av = a.total_pages;
        bv = b.total_pages;
      } else if (sortKey === 'rot') {
        av = rotRatio(a);
        bv = rotRatio(b);
      } else {
        av = a.avg_seo_score;
        bv = b.avg_seo_score;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [categories, filter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);

  // any control that mutates the result set should reset paging
  function setFilterReset(f: Filter) {
    setFilter(f);
    setPage(1);
  }
  // clicking the active sort key flips direction; clicking another sets it as the new key
  function pickSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
    setPage(1);
  }

  // Order on the right: all healthy mixed rotten · pages rot% seo · Where the rot lives.
  const controls = (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <div className="flex items-center gap-3">
        {(['all', 'healthy', 'mixed', 'rotten'] as Filter[]).map((f) => (
          <ChipText key={f} active={filter === f} onClick={() => setFilterReset(f)}>
            {f}
          </ChipText>
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
          <PageNudge onClick={() => setPage(current - 1)} disabled={current <= 1}>
            ← prev
          </PageNudge>
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
            {current} / {pageCount}
          </span>
          <PageNudge onClick={() => setPage(current + 1)} disabled={current >= pageCount}>
            next →
          </PageNudge>
        </div>
      )}
    </section>
  );
}

// minimalist separator between control groups in the header
function Divider() {
  return (
    <span aria-hidden="true" className="font-mono text-[10px] text-ink-400">
      ·
    </span>
  );
}

function ChipText({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[10px] uppercase tracking-widest transition ${
        active ? 'text-accent' : 'text-ink-300 hover:text-paper'
      }`}
    >
      {children}
    </button>
  );
}

// SortChip: same look as ChipText but appends an arrow when active. Click active to flip
// direction; click inactive to make it active (and reset direction to desc).
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
    <button
      onClick={() => onPick(k)}
      className={`font-mono text-[10px] uppercase tracking-widest transition ${
        active ? 'text-accent' : 'text-ink-300 hover:text-paper'
      }`}
    >
      {label}
      {active && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );
}

function PageNudge({
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
      className="font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:text-paper disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ink-300"
    >
      {children}
    </button>
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
    <li className="grid grid-cols-12 items-center gap-4 py-5">
      <span className="col-span-1 font-mono text-[10px] uppercase tracking-widest text-ink-300">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="col-span-5 min-w-0">
        <div className="display truncate text-xl font-light">{cat.category}</div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-300">
          {cat.total_pages} pages · {cat.rotten_pages} rotten · seo {cat.avg_seo_score}
        </div>
      </div>

      <div className="col-span-4">
        <div className="h-px w-full overflow-hidden bg-ink-500">
          <div className={`h-full ${style.bar}`} style={{ width: `${rotPct}%` }} />
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink-300">
          rot {Math.round(rotPct)}%
        </div>
      </div>

      <div className="col-span-2 text-right">
        <span className={`chip ${style.chip}`}>{cat.pattern.replace('_', ' ')}</span>
      </div>
    </li>
  );
}
