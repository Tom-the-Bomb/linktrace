interface Props {
  label: React.ReactNode;
  children: React.ReactNode;
}

// label-left / value-right list row; value cell passed as children
export function DataRow({ label, children }: Props) {
  return (
    <li className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="min-w-0 text-ink-2">{label}</span>
      <span className="shrink-0">{children}</span>
    </li>
  );
}
