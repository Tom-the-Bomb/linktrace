import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-[#383838]',
        secondary: 'bg-panel text-ink shadow-control hover:bg-sunken aria-expanded:bg-sunken',
        destructive: 'bg-destructive text-white hover:bg-[#a00c19]',
        ghost: 'text-ink-3 hover:bg-black/4 hover:text-ink',
      },
      size: {
        default: 'h-9 px-3 text-sm',
        sm: 'h-8 px-2.5 text-[13px]',
        lg: 'h-10 px-4 text-sm',
        xl: 'h-11 px-5 text-[15px]',
        quiet: 'gap-1.5 px-2 py-1 text-sm font-normal',
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
