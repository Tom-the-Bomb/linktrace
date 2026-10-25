import * as React from 'react';

import { cn } from 'cn';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'bg-panel text-ink-3 shadow-key pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1 font-mono text-[11px] select-none',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
