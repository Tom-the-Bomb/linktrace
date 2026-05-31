import { type FormEvent } from 'react';

import { Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AuthBar } from './AuthBar';

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

// sticky top bar on /history and /jobs/:id. hosts the new-crawl form, the stop/back
// button (when a job is active), and the AuthBar.
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
        <form onSubmit={onSubmit} className="ml-auto flex max-w-md flex-1 gap-2">
          <input
            type="text"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="new domain…"
            className="input flex-1 px-3 py-2 text-xs"
          />
          <button
            type="submit"
            disabled={submitting}
            // fixed size + shrink-0 so the "crawl" -> "…" swap during submit can't shift layout
            className="h-[34px] w-[80px] shrink-0 bg-accent font-mono text-[11px] uppercase tracking-widest text-ink-900 transition hover:bg-accent-soft disabled:opacity-50"
          >
            {submitting ? '…' : 'crawl'}
          </button>
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
        </form>

        <div className="ml-2">
          <AuthBar />
        </div>
      </div>
    </header>
  );
}
