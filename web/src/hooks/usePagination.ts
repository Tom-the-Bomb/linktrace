import { useState } from 'react';

// the current page of items; the page clamps when the list shrinks under it
export function usePagination<T>(items: T[], size: number) {
  const [page, setPage] = useState(1);
  const current = Math.min(page, Math.max(1, Math.ceil(items.length / size)));
  return { page: current, setPage, paged: items.slice((current - 1) * size, current * size) };
}
