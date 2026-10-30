import { cn } from '@/lib/utils';

export const fieldStyle =
  'rounded-control bg-panel text-ink shadow-control transition hover:not-focus-within:shadow-control-hover';

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        fieldStyle,
        'placeholder:text-ink-3 focus-visible:shadow-control-focus h-9 w-full min-w-0 px-3 text-sm outline-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
