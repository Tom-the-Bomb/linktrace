import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

// covers both tabs (data-active) and toggles (data-state=on)
export const segmentList =
  'inline-flex max-w-full flex-wrap rounded-control bg-sunken p-0.75 ring-1 ring-line ring-inset';
export const segmentItem =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm px-3 py-1 text-label font-medium whitespace-nowrap text-ink-3 transition hover:text-ink focus-visible:outline-offset-0 data-active:bg-panel data-active:text-ink data-active:shadow-segment data-[state=on]:bg-panel data-[state=on]:text-ink data-[state=on]:shadow-segment [&_svg]:shrink-0';

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
    <span className="text-ink-3 text-code font-mono">{count.toLocaleString()}</span>
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
