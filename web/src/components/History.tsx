import { useEffect, useState } from 'react';

import { ArrowRight, ChevronRight, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { type HistoryEntry, type HistoryRun, deleteJob, getHistory } from '../api';
import { errMessage, formatDate } from '../lib/format';
import { jobStatusChip, jobStatusLabel } from '../lib/status';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { ErrorBanner } from './ui/ErrorBanner';

// a run targeted for deletion; url + startedAt populate the confirm dialog
interface DeleteTarget {
  jobId: string;
  url: string;
  startedAt: string;
}

// per-site history: single-run sites show a flat row; multi-run sites expand to a run list
export function History() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // URLs whose run list is currently expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getHistory()
      .then(setEntries)
      .catch((e) => setError(errMessage(e)));
  }, []);

  const toggle = (url: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });

  // drop a deleted run in place: prune it, recompute count + latest pointers, drop the entry if it was the only run
  const removeRun = (jobId: string) =>
    setEntries((prev) =>
      prev
        ? prev.flatMap((e) => {
            if (!e.runs.some((r) => r.job_id === jobId)) {
              return [e];
            }
            const runs = e.runs.filter((r) => r.job_id !== jobId);
            if (runs.length === 0) {
              return [];
            }
            // runs stay newest-first, so runs[0] is the new latest
            return [
              {
                ...e,
                runs,
                crawl_count: runs.length,
                last_job_id: runs[0].job_id,
                last_crawled: runs[0].created_at,
              },
            ];
          })
        : prev,
    );

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteJob(pendingDelete.jobId);
      removeRun(pendingDelete.jobId);
      setPendingDelete(null);
    } catch (e) {
      // server message without the ApiError: prefix
      setDeleteError(errMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  function closeDialog() {
    setPendingDelete(null);
    setDeleteError(null);
  }

  return (
    <section>
      {error && <ErrorBanner className="mx-5 mb-4 sm:mx-8">{error}</ErrorBanner>}

      {!entries && !error && (
        <div className="panel h-48 animate-pulse" aria-busy="true" aria-label="Loading history" />
      )}

      {entries && entries.length === 0 && (
        <div className="panel px-6 py-12 text-center">
          <p className="text-lg font-bold tracking-tight">No crawls yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-ink-2">
            Crawls you run while logged in are saved here, so you can come back to their reports
            later.
          </p>
          <Link to="/" className="btn-primary mt-5 h-10 px-4 text-sm">
            Crawl a site
          </Link>
        </div>
      )}

      {entries && entries.length > 0 && (
        <ul className="panel divide-y divide-line">
          {entries.map((e) => (
            <HistoryRow
              key={e.url}
              entry={e}
              expanded={expanded.has(e.url)}
              onToggle={() => toggle(e.url)}
              onOpen={(jobId) => navigate(`/jobs/${jobId}`)}
              onRequestDelete={setPendingDelete}
            />
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          url={pendingDelete.url}
          startedAt={pendingDelete.startedAt}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDialog}
        />
      )}
    </section>
  );
}

function HistoryRow({
  entry,
  expanded,
  onToggle,
  onOpen,
  onRequestDelete,
}: {
  entry: HistoryEntry;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (jobId: string) => void;
  onRequestDelete: (target: DeleteTarget) => void;
}) {
  const multi = entry.crawl_count > 1;

  return (
    <li>
      <div className="group flex items-center gap-3 px-3 py-3 transition hover:bg-sunken sm:px-6">
        {/* chevron toggles the run list; a spacer keeps single-run rows aligned */}
        {multi ? (
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide runs' : 'Show runs'}
            className="icon-btn size-7 shrink-0"
          >
            <ChevronRight
              className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              strokeWidth={2.25}
            />
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-mono text-sm font-medium hover:text-accent-600 hover:underline"
          >
            {entry.url}
          </a>
          <p className="num mt-0.5 text-[13px] text-ink-3">
            {entry.crawl_count} {entry.crawl_count === 1 ? 'run' : 'runs'} · last{' '}
            {formatDate(entry.last_crawled)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* runs[0] is newest, so its status reflects the "view latest" target */}
          <StatusChip status={entry.runs[0]?.status} />
          {/* targets the latest run; older runs are deleted individually from RunRows below */}
          <DeleteButton
            onClick={() =>
              onRequestDelete({
                jobId: entry.last_job_id,
                url: entry.url,
                startedAt: entry.runs[0]?.created_at ?? entry.last_crawled,
              })
            }
          />
          <button
            onClick={() => onOpen(entry.last_job_id)}
            aria-label={multi ? 'Open latest report' : 'Open report'}
            className="btn-secondary h-8 px-2.5 text-[13px] sm:px-3"
          >
            <span className="hidden sm:inline">{multi ? 'Latest report' : 'Report'}</span>
            <ArrowRight className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      </div>

      {multi && expanded && (
        <ul className="border-t border-line bg-sunken py-1 pl-12 pr-3 sm:pl-16 sm:pr-6">
          {entry.runs.map((run, i) => (
            <RunRow
              key={run.job_id}
              run={run}
              index={entry.runs.length - i} // count down so latest = N, oldest = 1
              isLatest={i === 0}
              onOpen={() => onOpen(run.job_id)}
              onRequestDelete={() =>
                onRequestDelete({ jobId: run.job_id, url: entry.url, startedAt: run.created_at })
              }
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RunRow({
  run,
  index,
  isLatest,
  onOpen,
  onRequestDelete,
}: {
  run: HistoryRun;
  index: number;
  isLatest: boolean;
  onOpen: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 py-2">
      <span className="num w-8 shrink-0 font-mono text-[11px] text-ink-3">#{index}</span>
      <div className="min-w-0 flex-1 text-[13px] text-ink-2">
        {formatDate(run.created_at, true)}
        {isLatest && <span className="ml-2 text-[12px] font-semibold text-accent-600">latest</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <StatusChip status={run.status} />
        <DeleteButton onClick={onRequestDelete} />
        <button onClick={onOpen} aria-label="Open report" className="btn-quiet text-[13px]">
          <span className="hidden sm:inline">Report</span>
          <ArrowRight className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

// trash affordance shared by both rows: quiet until hovered/focused on desktop
function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Delete crawl"
      title="Delete crawl"
      className="icon-btn hover:!bg-bad-bg hover:!text-bad-fg focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <Trash2 className="size-4" strokeWidth={2} />
    </button>
  );
}

function StatusChip({ status }: { status?: string }) {
  if (!status) {
    return null;
  }
  return <span className={`chip ${jobStatusChip(status)}`}>{jobStatusLabel(status)}</span>;
}
