import { ArrowLeft, Square } from 'lucide-react';

import { AuthBar } from './AuthBar';
import { CrawlForm } from './CrawlForm';
import { Wordmark } from './Wordmark';
import { Button } from './ui/button';

interface CompactHeaderProps {
  onSubmit: (url: string) => void;
  submitting: boolean;
  canStop?: boolean;
  onStopOrBack?: () => void;
}

export function CompactHeader({ onSubmit, submitting, canStop, onStopOrBack }: CompactHeaderProps) {
  return (
    <header className="bg-canvas sticky top-0 z-30 border-b">
      <div className="frame flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-5 md:px-6">
        <div className="flex items-center justify-between gap-3 md:contents">
          <Wordmark />
          <div className="md:order-last md:ml-auto">
            <AuthBar />
          </div>
        </div>
        <CrawlForm onSubmit={onSubmit} submitting={submitting}>
          {onStopOrBack && (
            <Button
              type="button"
              variant="secondary"
              onClick={onStopOrBack}
              className={canStop ? 'text-bad-fg' : undefined}
            >
              {canStop ? (
                <>
                  <Square className="size-3 fill-current" strokeWidth={2.5} />
                  Stop
                </>
              ) : (
                <>
                  <ArrowLeft strokeWidth={2.25} />
                  <span className="sr-only sm:not-sr-only">Home</span>
                </>
              )}
            </Button>
          )}
        </CrawlForm>
      </div>
    </header>
  );
}
