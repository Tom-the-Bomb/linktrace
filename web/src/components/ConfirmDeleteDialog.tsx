import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  // The crawl being deleted; url + start date are shown so the user can tell runs apart.
  url: string;
  startedAt: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// Crawl-specific delete confirmation: the shared ConfirmDialog plus a website/started detail
// block. Used by the history rows and the job report page.
export function ConfirmDeleteDialog({ url, startedAt, busy, error, onConfirm, onCancel }: Props) {
  return (
    <ConfirmDialog
      eyebrow="delete crawl"
      title="This can’t be undone"
      message="Permanently delete this crawl and all of its results. If it's still running, it will be stopped and its workers freed."
      confirmLabel="delete"
      busyLabel="deleting…"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
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
    </ConfirmDialog>
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
