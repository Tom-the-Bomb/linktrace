import { CircleX } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  // per-site margin tweaks
  className?: string;
}

// tinted error notice with icon
export function ErrorBanner({ children, className = '' }: Props) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-control bg-bad-bg px-4 py-3 text-sm font-medium text-bad-fg ${className}`}
    >
      <CircleX className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
