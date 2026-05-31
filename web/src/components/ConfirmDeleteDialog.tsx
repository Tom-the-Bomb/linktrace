import { useEffect } from 'react';

interface Props {
  // The crawl being deleted; url + start date are shown so the user can tell runs apart.
  url: string;
  startedAt: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// Centered destructive-confirm modal. Reuses the SeoDrawer overlay pattern (fixed backdrop at
// z-40, panel at z-50, Esc + backdrop-click to dismiss) but as a small dialog. Used for both the
// history rows and the job report page; both pass the crawl's url and start time.
export function ConfirmDeleteDialog({ url, startedAt, busy, error, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink-900/70 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirm delete crawl"
          className="w-full max-w-md border border-ink-500/70 bg-ink-800 shadow-2xl"
        >
          <header className="border-b border-ink-500/70 px-6 py-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-rose-300">
              delete crawl
            </div>
            <h2 className="display mt-1 text-lg font-normal">This can&rsquo;t be undone</h2>
          </header>

          <div className="px-6 py-5">
            <p className="text-sm leading-relaxed text-ink-300">
              Permanently delete this crawl and all of its results. If it&rsquo;s still running,
              it will be stopped and its workers freed.
            </p>

            <dl className="mt-4 divide-y divide-ink-500/40 border border-ink-500/60 bg-ink-700/40 font-mono text-xs">
              <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-ink-400">website</dt>
                <dd className="truncate text-paper">{url}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-ink-400">started</dt>
                <dd className="text-paper">{formatStarted(startedAt)}</dd>
              </div>
            </dl>

            {error && (
              <div className="mt-4 border-l-2 border-rose-500 bg-rose-500/5 px-4 py-2.5 font-mono text-xs text-rose-200">
                {error}
              </div>
            )}
          </div>

          <footer className="flex justify-end gap-3 border-t border-ink-500/70 px-6 py-4">
            <button
              onClick={onCancel}
              disabled={busy}
              className="border border-ink-500/70 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:bg-ink-600/40 hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="border border-rose-400/50 bg-rose-500/10 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'deleting…' : 'delete'}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

function formatStarted(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
