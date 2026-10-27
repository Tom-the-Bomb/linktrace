import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Wordmark() {
  return (
    <Link
      to="/"
      className="rounded-control inline-flex items-center gap-2"
      aria-label="LinkTrace home"
    >
      <span className="rounded-control bg-ink flex size-6 items-center justify-center text-white">
        <Link2 className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="tracking-headline text-[19px] font-semibold">linktrace</span>
    </Link>
  );
}
