import { CircleX } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function ErrorBanner({ children, className = '' }: Props) {
  return (
    <div
      role="alert"
      className={`rounded-control bg-bad-bg text-bad-fg flex items-start gap-2.5 px-4 py-3 text-sm font-medium ${className}`}
    >
      <CircleX className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
