import { ChartNetwork, Table2 } from 'lucide-react';

export type Tab = 'graph' | 'table';

// graph/table switcher, each tab showing its item count
export function Tabs({
  tab,
  onChange,
  graphCount,
  tableCount,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  graphCount: number;
  tableCount: number;
}) {
  const items = [
    { id: 'graph' as const, label: 'Graph', count: graphCount, icon: ChartNetwork },
    { id: 'table' as const, label: 'Table', count: tableCount, icon: Table2 },
  ];
  return (
    <div className="seg" role="tablist" aria-label="Explore view">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={tab === it.id}
          onClick={() => onChange(it.id)}
          className="seg-btn px-3.5"
        >
          <it.icon className="size-4" strokeWidth={2} aria-hidden="true" />
          {it.label}
          <span className="num font-mono text-[11px] text-ink-3">{it.count.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}
