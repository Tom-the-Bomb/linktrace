type Variant = 'filter' | 'sort' | 'tab';

interface Props {
  active: boolean;
  onClick: () => void;
  count?: number;
  variant?: Variant;
  children: React.ReactNode;
}

// per-variant box metrics + borders (chips border themselves; tabs share the container border)
const VARIANT: Record<Variant, string> = {
  filter: 'gap-1.5 border border-ink-500/70 px-3 py-1.5 text-[10px] first:border-r-0 last:border-l-0',
  sort: 'gap-1.5 border border-ink-500/70 px-3 py-1.5 text-[10px] first:border-r-0',
  tab: 'gap-2 px-5 py-2.5 text-[11px]',
};

// bordered segmented toggle (filter/sort chips, graph/table tabs)
export function SegButton({ active, onClick, count, variant = 'filter', children }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex items-baseline font-mono uppercase tracking-widest transition ${VARIANT[variant]} ${
        active ? 'bg-accent text-ink-900' : 'text-ink-300 hover:bg-ink-600/40 hover:text-paper'
      }`}
    >
      <span>{children}</span>
      {count !== undefined && <span className="text-[10px] opacity-60">{count}</span>}
    </button>
  );
}
