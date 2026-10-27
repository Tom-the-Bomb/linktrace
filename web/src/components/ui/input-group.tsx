import { type VariantProps, cva } from 'class-variance-authority';

import { fieldStyle } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        fieldStyle,
        'focus-within:shadow-control-focus relative flex h-9 w-full min-w-0 items-center',
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
        'placeholder:text-ink-3 h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none',
        className,
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon, InputGroupInput };
