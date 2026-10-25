import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from 'cn';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.75 text-[12px]/[1.35] font-medium whitespace-nowrap ring-1 ring-inset [&>svg]:pointer-events-none [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        ok: 'bg-ok-bg text-ok-fg ring-ok-dot/25',
        warn: 'bg-warn-bg text-warn-fg ring-warn-dot/30',
        bad: 'bg-bad-bg text-bad-fg ring-bad-dot/25',
        neutral: 'bg-panel text-ink-2 ring-line-strong',
      },
      // outcome codes and figures keep the mono voice
      mono: { true: 'font-mono text-[11px]/[1.35]' },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

function Badge({
  className,
  variant,
  mono,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, mono }), className)}
      {...props}
    />
  );
}

export { Badge, type BadgeVariant };
