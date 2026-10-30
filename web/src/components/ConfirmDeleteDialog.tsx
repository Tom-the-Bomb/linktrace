import { formatDate } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  url: string;
  startedAt: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({ url, startedAt, onConfirm, onCancel }: Props) {
  return (
    <ConfirmDialog
      title="Delete this crawl?"
      message="This deletes the crawl and its results (and stops it if it's still running). It can't be undone."
      confirmLabel="Delete crawl"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <dl className="mt-4 divide-y border-y text-sm">
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-ink-3 shrink-0">Website</dt>
          <dd className="text-label truncate font-mono">{url}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-ink-3 shrink-0">Started</dt>
          <dd>{formatDate(startedAt, true)}</dd>
        </div>
      </dl>
    </ConfirmDialog>
  );
}
