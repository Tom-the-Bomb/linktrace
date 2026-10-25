import * as React from 'react';

import { cn } from 'cn';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';

// the segmented-control look, shared with tabs.tsx (selected = toggle "on" or tab "active")
export const segmentList =
  'inline-flex max-w-full overflow-x-auto rounded-control bg-sunken p-0.75 ring-1 ring-line ring-inset';
export const segmentItem =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[4px] px-3 py-1 text-[13px] font-medium whitespace-nowrap text-ink-3 transition outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 data-active:bg-panel data-active:text-ink data-active:shadow-[0_0_0_1px_#eaeaea,0_1px_2px_rgba(0,0,0,0.06)] data-[state=on]:bg-panel data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_#eaeaea,0_1px_2px_rgba(0,0,0,0.06)] [&_svg]:shrink-0';

function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(segmentList, className)}
      {...props}
    />
  );
}

export function SegmentCount({ count }: { count?: number }) {
  return count === undefined ? null : (
    <span className="num text-ink-3 font-mono text-[11px]">{count.toLocaleString()}</span>
  );
}

function ToggleGroupItem({
  className,
  count,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & { count?: number }) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(segmentItem, className)}
      {...props}
    >
      {children}
      <SegmentCount count={count} />
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
