import { formatDate } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  // url + start date shown so runs are distinguishable
  url: string;
  startedAt: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// crawl delete confirmation: ConfirmDialog plus a website/started detail block
export function ConfirmDeleteDialog({ url, startedAt, busy, error, onConfirm, onCancel }: Props) {
  return (
    <ConfirmDialog
      title="Delete this crawl?"
      message="This permanently deletes the crawl and its results (and stops it, if it's still running). This can't be undone."
      confirmLabel="Delete crawl"
      busyLabel="Deleting…"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-ink-3">Website</dt>
          <dd className="truncate font-mono text-[13px]">{url}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-ink-3">Started</dt>
          <dd>{formatDate(startedAt, true)}</dd>
        </div>
      </dl>
    </ConfirmDialog>
  );
}
