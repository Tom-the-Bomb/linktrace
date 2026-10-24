import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  current: number;
  pageCount: number;
  onPage: (page: number) => void;
}

// prev / "current of pageCount" / next paginator
export function Pager({ current, pageCount, onPage }: Props) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPage(current - 1)}
        disabled={current <= 1}
        aria-label="Previous page"
        className="icon-btn disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft className="size-4" strokeWidth={2.25} />
      </button>
      <span className="num min-w-16 text-center text-[13px] font-medium text-ink-2">
        {current} of {pageCount}
      </span>
      <button
        onClick={() => onPage(current + 1)}
        disabled={current >= pageCount}
        aria-label="Next page"
        className="icon-btn disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight className="size-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}
