import { type FormEvent } from 'react';

import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AuthBar } from './AuthBar';
import { CrawlForm } from './CrawlForm';

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

// sticky top bar on /history and /jobs/:id: new-crawl form, stop/back button, AuthBar
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
    <header className="sticky top-0 z-30 border-b border-ink-500/70 bg-ink-900/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4 sm:px-10">
        <Link to="/" className="flex items-center gap-2" aria-label="Go to home">
          <Link2 className="h-4 w-4 text-accent" strokeWidth={2.25} />
          <span className="display text-lg font-medium tracking-tight">linktrace</span>
        </Link>
        {jobId && (
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-ink-300 sm:inline">
            / job · {jobId.slice(0, 8)}
          </span>
        )}
        <CrawlForm
          variant="compact"
          url={url}
          setUrl={setUrl}
          onSubmit={onSubmit}
          submitting={submitting}
        >
          {jobId && (
            <button
              type="button"
              onClick={onStopOrBack}
              className={`h-[34px] w-[78px] shrink-0 border font-mono text-[11px] uppercase tracking-widest transition ${
                isDone
                  ? 'border-ink-500 text-ink-300 hover:border-paper hover:text-paper'
                  : 'border-rose-400/50 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200'
              }`}
            >
              {isDone ? '← back' : 'stop'}
            </button>
          )}
        </CrawlForm>

        <div className="ml-2">
          <AuthBar />
        </div>
      </div>
    </header>
  );
}
