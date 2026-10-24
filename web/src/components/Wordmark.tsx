import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

// the linktrace logo lockup: black tile + wordmark, linking home.
export function Wordmark({ to = '/', className = '' }: { to?: string; className?: string }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-control ${className}`}
      aria-label="LinkTrace home"
    >
      <span className="flex size-6 items-center justify-center rounded-[6px] bg-ink text-white">
        <Link2 className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="text-[19px] font-semibold tracking-[-0.04em]">linktrace</span>
    </Link>
  );
}
