interface Props {
  children: React.ReactNode;
  // per-site padding/margin tweaks
  className?: string;
}

// rose left-rule error banner
export function ErrorBanner({ children, className = '' }: Props) {
  return (
    <div
      className={`border-l-2 border-rose-500 bg-rose-500/5 py-3 font-mono text-xs text-rose-200 ${className}`}
    >
      {children}
    </div>
  );
}
