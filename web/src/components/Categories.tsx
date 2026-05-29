import type { CategoryReport } from '../api';
import { SectionHeader } from './SectionHeader';

// Per-category breakdown rendered as a wide list, each row sized to read at a glance.
export function Categories({ categories }: { categories: CategoryReport[] }) {
  return (
    <section>
      <SectionHeader number="03" title="By section" subtitle="Where the rot lives." />

      <ul className="divide-y divide-ink-500/60 border-y border-ink-500/60">
        {categories.map((c, i) => (
          <CategoryRow key={c.category} cat={c} index={i} />
        ))}
      </ul>
    </section>
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
