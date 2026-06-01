import { SegButton } from './ui/SegButton';

export type Tab = 'graph' | 'table';

// graph/table toggle, each chip showing its item count
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
        <SegButton
          key={it.id}
          variant="tab"
          active={tab === it.id}
          onClick={() => onChange(it.id)}
          count={it.count}
        >
          {it.label}
        </SegButton>
      ))}
    </div>
  );
}
