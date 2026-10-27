import { ArrowLeft, Square } from 'lucide-react';

import { cn } from '@/lib/utils';

import { AuthBar } from './AuthBar';
import { CrawlForm } from './CrawlForm';
import { Wordmark } from './Wordmark';
import { Button } from './ui/button';

interface CompactHeaderProps {
  onSubmit: (url: string) => void;
  submitting: boolean;
  // the report page's button: Stop while the viewer's own crawl runs, Home otherwise
  canStop?: boolean;
  onStopOrBack?: () => void;
}

// sticky top bar on /history and /jobs/:id: new-crawl launcher, stop/back button, AuthBar
export function CompactHeader({ onSubmit, submitting, canStop, onStopOrBack }: CompactHeaderProps) {
  return (
    <header className="bg-canvas sticky top-0 z-30 border-b">
      <div className="frame flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-5 md:px-6">
        {/* mobile: logo left + auth right on their own line; desktop: dissolve into the row */}
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
              className={cn('shrink-0', canStop && 'text-bad-fg')}
            >
              {canStop ? (
                <>
                  <Square className="size-3 fill-current" strokeWidth={2.5} />
                  Stop
                </>
              ) : (
                <>
                  <ArrowLeft strokeWidth={2.25} />
                  <span className="hidden sm:inline">Home</span>
                </>
              )}
            </Button>
          )}
        </CrawlForm>
      </div>
    </header>
  );
}
