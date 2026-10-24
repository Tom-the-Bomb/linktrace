import { forwardRef } from 'react';

interface Props {
  visible: boolean;
  path: string;
  detail: string;
  detailClass?: string;
}

// pointer-following tooltip (path left, value right); caller writes position via the ref to avoid re-renders
export const NodeTooltip = forwardRef<HTMLDivElement, Props>(function NodeTooltip(
  { visible, path, detail, detailClass = '' },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute left-0 top-0 z-30 flex max-w-xs items-center gap-3 rounded-lg bg-ink px-2.5 py-1.5 font-mono text-[11px] text-white shadow-lift transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="truncate">{path}</span>
      <span className={`num shrink-0 font-medium ${detailClass}`}>{detail}</span>
    </div>
  );
});
