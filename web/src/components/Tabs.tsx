export type Tab = 'graph' | 'table';

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
  const items: { id: Tab; label: string; count: number }[] = [
    { id: 'graph', label: 'graph', count: graphCount },
    { id: 'table', label: 'table', count: tableCount },
  ];
  return (
    <div className="inline-flex border border-ink-500/70 bg-ink-800/60">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={`flex items-baseline gap-2 px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest transition ${
            tab === it.id
              ? 'bg-accent text-ink-900'
              : 'text-ink-300 hover:bg-ink-600/40 hover:text-paper'
          }`}
        >
          <span>{it.label}</span>
          <span className="text-[10px] opacity-60">{it.count}</span>
        </button>
      ))}
    </div>
  );
}
