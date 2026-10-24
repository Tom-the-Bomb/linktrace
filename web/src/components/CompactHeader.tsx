import { type FormEvent } from 'react';

import { ArrowLeft, Square } from 'lucide-react';

import { AuthBar } from './AuthBar';
import { CrawlForm } from './CrawlForm';
import { Wordmark } from './Wordmark';

interface CompactHeaderProps {
  // jobId is absent on /history (no job loaded)
  jobId?: string;
  url: string;
  setUrl: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitting: boolean;
  isDone: boolean;
  onStopOrBack: () => void;
}

// sticky top bar on /history and /jobs/:id: new-crawl launcher, stop/back button, AuthBar
export function CompactHeader({
  jobId,
  url,
  setUrl,
  onSubmit,
  submitting,
  isDone,
  onStopOrBack,
}: CompactHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      <div className="frame flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-5 md:px-6">
        {/* mobile: logo left + auth right on their own line; desktop: dissolve into the row */}
        <div className="flex items-center justify-between gap-3 md:contents">
          <Wordmark />
          <div className="md:order-last md:ml-auto">
            <AuthBar />
          </div>
        </div>
        <CrawlForm url={url} setUrl={setUrl} onSubmit={onSubmit} submitting={submitting}>
          {jobId && (
            <button
              type="button"
              onClick={onStopOrBack}
              className={`btn-secondary h-9 shrink-0 px-3 text-sm ${isDone ? '' : '!text-bad-fg'}`}
            >
              {isDone ? (
                <>
                  <ArrowLeft className="size-4" strokeWidth={2.25} aria-hidden="true" />
                  <span className="hidden sm:inline">Home</span>
                </>
              ) : (
                <>
                  <Square className="size-3 fill-current" strokeWidth={2.5} aria-hidden="true" />
                  Stop
                </>
              )}
            </button>
          )}
        </CrawlForm>
      </div>
    </header>
  );
}
