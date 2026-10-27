interface Props {
  label: React.ReactNode;
  children: React.ReactNode;
}

export function DataRow({ label, children }: Props) {
  return (
    <li className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="text-ink-2 min-w-0">{label}</span>
      <span className="shrink-0">{children}</span>
    </li>
  );
}
