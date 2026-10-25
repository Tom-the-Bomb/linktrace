import * as React from 'react';

import { cn } from 'cn';

export const fieldStyle =
  'rounded-control bg-panel text-ink shadow-control transition hover:shadow-[0_0_0_1px_#d4d4d4]';

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        fieldStyle,
        'placeholder:text-ink-3 h-9 w-full min-w-0 px-3 text-sm outline-none focus-visible:shadow-[0_0_0_1px_#a1a1a1,0_0_0_4px_rgba(0,0,0,0.06)] disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
