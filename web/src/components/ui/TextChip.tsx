interface Props {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

// borderless mono toggle; accent when active (sort chips append their own arrow as children)
export function TextChip({ active, onClick, children }: Props) {
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
