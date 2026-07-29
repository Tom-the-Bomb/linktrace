import { useEffect, useState } from 'react';

import { ArrowRight, ChevronRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { type HistoryEntry, type HistoryRun, deleteJob, getHistory } from '../api';
import { errMessage, formatDate } from '../lib/format';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { SectionHeader } from './SectionHeader';

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
      <SectionHeader number="—" title="History" subtitle="Your previous crawls" />

      {error && (
        <div className="border-l-2 border-rose-500 bg-rose-500/5 px-5 py-3 font-mono text-xs text-rose-200">
          {error}
        </div>
      )}

      {entries && entries.length === 0 && (
        <p className="font-mono text-xs text-ink-300">
          No crawls yet. Start one while logged in and it will show up here.
        </p>
      )}

      {entries && entries.length > 0 && (
        <ul className="divide-y divide-ink-500/60 border-y border-ink-500/60">
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
      <div
        onClick={multi ? onToggle : undefined}
        className={`group flex items-center gap-3 py-4 pl-1 pr-3 transition hover:bg-ink-700/30 ${multi ? 'cursor-pointer' : ''}`}
      >
        {/* chevron: blank when single-run, lights up on row hover */}
        <div className="flex w-4 shrink-0 justify-center">
          {multi ? (
            <ChevronRight
              className={`h-4 w-4 text-ink-300 transition-transform group-hover:text-accent ${expanded ? 'rotate-90' : ''}`}
              strokeWidth={2}
            />
          ) : null}
        </div>
        {/* url with run-count + date stacked beneath; truncates so the row never overflows */}
        <div className="min-w-0 flex-1">
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            className="block truncate font-mono text-sm text-paper hover:text-accent"
          >
            {entry.url}
          </a>
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-ink-300">
            <span className="uppercase tracking-widest">
              {entry.crawl_count}
              {entry.crawl_count === 1 ? ' run' : ' runs'}
            </span>
            <span className="text-ink-500">·</span>
            <span className="text-ink-400">{formatDate(entry.last_crawled)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* targets the latest run; older runs are deleted individually from RunRows below */}
          <DeleteButton
            onClick={(ev) => {
              ev.stopPropagation();
              onRequestDelete({
                jobId: entry.last_job_id,
                url: entry.url,
                startedAt: entry.runs[0]?.created_at ?? entry.last_crawled,
              });
            }}
          />
          {/* runs[0] is newest, so its status reflects the "view latest" target */}
          <StatusBadge status={entry.runs[0]?.status} />
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onOpen(entry.last_job_id);
            }}
            aria-label={multi ? 'View latest crawl' : 'View report'}
            className="flex shrink-0 items-center whitespace-nowrap border border-ink-500/70 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:border-accent hover:text-accent sm:px-3"
          >
            <span className="hidden sm:inline">{multi ? 'view latest' : 'view report'}</span>
            <ArrowRight className="size-3.5 sm:hidden" strokeWidth={2} />
          </button>
        </div>
      </div>

      {multi && expanded && (
        <ul className="ml-8 border-l border-ink-500/60 py-1 pl-4">
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
    <li className="group flex items-center gap-3 py-2 pr-3 transition hover:bg-ink-700/30">
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-400">
        #{String(index).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1 font-mono text-[11px] text-ink-300">
        {formatDate(run.created_at, true)}
        {isLatest && (
          <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-accent/70">
            latest
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <DeleteButton
          small
          onClick={(ev) => {
            ev.stopPropagation();
            onRequestDelete();
          }}
        />
        <StatusBadge status={run.status} />
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            onOpen();
          }}
          aria-label="View report"
          className="btn-ghost flex items-center whitespace-nowrap"
        >
          <span className="hidden sm:inline">view report →</span>
          <ArrowRight className="size-3.5 sm:hidden" strokeWidth={2} />
        </button>
      </div>
    </li>
  );
}

// trash affordance shared by both rows: hidden until row hover/focus, lights rose on hover
function DeleteButton({
  onClick,
  className = '',
  small = false,
}: {
  onClick: (ev: React.MouseEvent) => void;
  className?: string;
  // run rows use a smaller icon than top-level rows
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Delete crawl"
      title="Delete crawl"
      className={`flex items-center text-ink-400 opacity-100 transition hover:text-rose-300 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${className}`}
    >
      <Trash2 className={small ? 'h-3.5 w-3.5 translate-x-0.5' : 'h-4 w-4'} strokeWidth={2} />
    </button>
  );
}

// border + text colour per status; unknown falls back to neutral ink
const STATUS_STYLES: Record<string, string> = {
  complete: 'border-emerald-400/40 text-emerald-300',
  crawling: 'border-accent/40 text-accent',
  checking: 'border-accent/40 text-accent',
  pending: 'border-ink-500/70 text-ink-300',
  failed: 'border-rose-400/40 text-rose-300',
  stopped: 'border-amber-400/40 text-amber-300',
};

// dot colour mirrors STATUS_STYLES, used for the compact mobile indicator
const STATUS_DOT: Record<string, string> = {
  complete: 'bg-emerald-400',
  crawling: 'bg-accent',
  checking: 'bg-accent',
  pending: 'bg-ink-400',
  failed: 'bg-rose-400',
  stopped: 'bg-amber-400',
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) {
    return null;
  }
  const cls = STATUS_STYLES[status] ?? 'border-ink-500/70 text-ink-300';
  const dot = STATUS_DOT[status] ?? 'bg-ink-400';
  return (
    <>
      {/* mobile: colour-coded dot to save horizontal space */}
      <span
        title={status}
        className={`inline-block size-2 shrink-0 rounded-full sm:hidden ${dot}`}
      />
      {/* desktop: full labelled badge */}
      <span
        className={`hidden whitespace-nowrap border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest sm:inline-block ${cls}`}
      >
        {status}
      </span>
    </>
  );
}
