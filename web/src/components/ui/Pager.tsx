import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from './button';

interface Props {
  page: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
}

// list footer with the shown range and previous / next; nothing when one page holds everything
export function Pager({ page, total, size, onPage }: Props) {
  const pageCount = Math.ceil(total / size);
  if (pageCount <= 1) {
    return null;
  }
  const start = (page - 1) * size;
  return (
    <footer className="border-line flex items-center justify-between gap-3 border-t px-5 py-2.5 sm:px-8">
      <span className="num text-ink-3 text-[13px]">
        {(start + 1).toLocaleString()} to {Math.min(start + size, total).toLocaleString()} of{' '}
        {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="disabled:opacity-30"
        >
          <ChevronLeft strokeWidth={2.25} />
        </Button>
        <span className="num text-ink-2 min-w-16 text-center text-[13px] font-medium">
          {page} of {pageCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className="disabled:opacity-30"
        >
          <ChevronRight strokeWidth={2.25} />
        </Button>
      </div>
    </footer>
  );
}
