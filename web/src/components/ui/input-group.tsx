import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from 'cn';

import { fieldStyle } from '@/components/ui/input';

// a field with icons, prefixes or counts beside the input; clicking an addon focuses the input
function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        fieldStyle,
        'relative flex h-9 w-full min-w-0 items-center focus-within:shadow-[0_0_0_1px_#a1a1a1,0_0_0_4px_rgba(0,0,0,0.06)]',
        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-full cursor-text items-center gap-2 text-sm text-ink-3 select-none [&>svg:not([class*='size-'])]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-2.5',
        'inline-end': 'order-last pr-2.5',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  },
);

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => e.currentTarget.parentElement?.querySelector('input')?.focus()}
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        'placeholder:text-ink-3 h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon, InputGroupInput };
