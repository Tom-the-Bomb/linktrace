import { forwardRef } from 'react';

interface Props {
  visible: boolean;
  path: string;
  detail: string;
  detailClass?: string;
  // fixed for the landing backdrop, absolute inside the graph container
  position?: 'fixed' | 'absolute';
}

// pointer-following tooltip (path left, value right); caller writes position via the ref to avoid re-renders
export const NodeTooltip = forwardRef<HTMLDivElement, Props>(function NodeTooltip(
  { visible, path, detail, detailClass = '', position = 'absolute' },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`pointer-events-none ${position} left-0 top-0 z-30 flex items-center gap-3 border-l border-accent/25 bg-ink-800/60 px-3 py-1.5 font-mono text-[11px] backdrop-blur-sm transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="text-ink-200 opacity-60">{path}</span>
      <span className={`tabular-nums opacity-40 ${detailClass}`}>{detail}</span>
    </div>
  );
});
