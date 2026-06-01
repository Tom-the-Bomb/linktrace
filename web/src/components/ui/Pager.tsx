interface Props {
  current: number;
  pageCount: number;
  onPage: (page: number) => void;
  // bordered buttons (ResultsTable) vs borderless nudges (Categories)
  bordered?: boolean;
}

const BORDERED =
  'border border-ink-500/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:bg-ink-600/40 hover:text-paper disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-300';
const PLAIN =
  'font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:text-paper disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ink-300';

// prev / "current / pageCount" / next paginator
export function Pager({ current, pageCount, onPage, bordered }: Props) {
  const btn = bordered ? BORDERED : PLAIN;
  return (
    <>
      <button onClick={() => onPage(current - 1)} disabled={current <= 1} className={btn}>
        ← prev
      </button>
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
        {current} / {pageCount}
      </span>
      <button onClick={() => onPage(current + 1)} disabled={current >= pageCount} className={btn}>
        next →
      </button>
    </>
  );
}
