interface Props {
  label: string;
  children: React.ReactNode;
  // baseline-aligned + tighter (site-wide seo grid) vs centred default
  compact?: boolean;
}

// label-left / value-right list row; value cell passed as children
export function DataRow({ label, children, compact }: Props) {
  const layout = compact ? 'items-baseline py-1.5' : 'items-center py-2.5';
  return (
    <li className={`flex justify-between font-mono text-xs ${layout}`}>
      <span className="text-paper/80">{label}</span>
      {children}
    </li>
  );
}
