import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from './button';

interface Props {
  page: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
}

export function Pager({ page, total, size, onPage }: Props) {
  const pageCount = Math.ceil(total / size);
  if (pageCount <= 1) {
    return null;
  }
  const start = (page - 1) * size;
  return (
    <footer className="gutter flex items-center justify-between gap-3 border-t py-2.5">
      <span className="text-ink-3 text-label tabular-nums">
        {(start + 1).toLocaleString()} to {Math.min(start + size, total).toLocaleString()} of{' '}
        {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => page > 1 && onPage(page - 1)}
          aria-disabled={page <= 1}
          aria-label="Previous page"
          className="aria-disabled:pointer-events-none aria-disabled:opacity-30 aria-disabled:focus-visible:opacity-100"
        >
          <ChevronLeft strokeWidth={2.25} />
        </Button>
        <span className="text-ink-2 text-label min-w-16 text-center font-medium tabular-nums">
          {page} of {pageCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => page < pageCount && onPage(page + 1)}
          aria-disabled={page >= pageCount}
          aria-label="Next page"
          className="aria-disabled:pointer-events-none aria-disabled:opacity-30 aria-disabled:focus-visible:opacity-100"
        >
          <ChevronRight strokeWidth={2.25} />
        </Button>
      </div>
    </footer>
  );
}
