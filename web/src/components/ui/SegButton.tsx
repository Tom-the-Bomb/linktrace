interface Props {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}

// one option inside a .seg segmented control
export function SegButton({ active, onClick, count, children }: Props) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="seg-btn">
      <span>{children}</span>
      {count !== undefined && (
        <span className={`num font-mono text-[11px] ${active ? 'text-ink-3' : 'text-ink-3/80'}`}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}
