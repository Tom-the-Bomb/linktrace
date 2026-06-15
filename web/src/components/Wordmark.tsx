import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

// the linktrace logo lockup: icon + wordmark, linking home.
export function Wordmark({
  to = '/',
  size = 'xl',
  className = '',
}: {
  to?: string;
  size?: 'lg' | 'xl';
  className?: string;
}) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 ${className}`} aria-label="Go to home">
      <Link2 className="h-4 w-4 text-accent" strokeWidth={2.25} />
      <span
        className={`display font-medium tracking-tight ${size === 'lg' ? 'text-lg' : 'text-xl'}`}
      >
        linktrace
      </span>
    </Link>
  );
}
