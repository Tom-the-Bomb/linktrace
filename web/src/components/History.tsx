import { useEffect, useState } from 'react';

import { ArrowRight, ChevronRight, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { type HistoryEntry, type HistoryRun, deleteJob, getHistory } from '../api';
import { errMessage, formatDate } from '../lib/format';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { ErrorBanner } from './ui/ErrorBanner';
import { JobStatusChip } from './ui/StatusChip';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

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

  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    getHistory()
      .then(setEntries)
      .catch((e) => setError(errMessage(e)));
  }, []);

  // prune a deleted run in place, dropping the site when it was its only run
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

  async function confirmDelete(jobId: string) {
    await deleteJob(jobId);
    removeRun(jobId);
    setPendingDelete(null);
  }

  return (
    <section>
      {error && <ErrorBanner className="mx-5 mb-4 sm:mx-8">{error}</ErrorBanner>}

      {!entries && !error && (
        <div className="panel h-48 animate-pulse" aria-busy="true" aria-label="Loading history" />
      )}

      {entries && entries.length === 0 && (
        <div className="panel px-6 py-12 text-center">
          <p className="text-lg font-semibold tracking-tight">No crawls yet</p>
          <p className="text-ink-2 text-body mx-auto mt-1.5 max-w-sm">
            Crawls you run while logged in show up here.
          </p>
          <Button size="lg" className="mt-5" asChild>
            <Link to="/">Crawl a site</Link>
          </Button>
        </div>
      )}

      {entries && entries.length > 0 && (
        <ul className="panel divide-y">
          {entries.map((e) => (
            <HistoryRow
              key={e.url}
              entry={e}
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
          onConfirm={() => confirmDelete(pendingDelete.jobId)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}

function HistoryRow({
  entry,
  onOpen,
  onRequestDelete,
}: {
  entry: HistoryEntry;
  onOpen: (jobId: string) => void;
  onRequestDelete: (target: DeleteTarget) => void;
}) {
  const multi = entry.crawl_count > 1;

  return (
    <Collapsible asChild>
      <li>
        <div className="group hover:bg-sunken flex items-center gap-3 p-3 transition sm:px-6">
          {/* chevron toggles the run list; a spacer keeps single-run rows aligned */}
          {multi ? (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Runs" className="size-7">
                <ChevronRight
                  className="transition-transform [[data-state=open]>&]:rotate-90"
                  strokeWidth={2.25}
                />
              </Button>
            </CollapsibleTrigger>
          ) : (
            <span className="w-7 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="tap-area hover:text-link-600 block w-fit max-w-full truncate font-mono text-sm font-medium hover:underline"
            >
              {entry.url}
            </a>
            <p className="num text-ink-3 text-label mt-0.5">
              {entry.crawl_count} {entry.crawl_count === 1 ? 'run' : 'runs'}, last on{' '}
              {formatDate(entry.last_crawled)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* first, so its hidden space sits in the row's empty middle; deletes the latest run */}
            <DeleteButton
              onClick={() =>
                onRequestDelete({
                  jobId: entry.last_job_id,
                  url: entry.url,
                  startedAt: entry.last_crawled,
                })
              }
            />
            <JobStatusChip status={entry.runs[0].status} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpen(entry.last_job_id)}
              aria-label={multi ? 'Open latest report' : 'Open report'}
              className="ml-1.5 sm:ml-2 sm:px-3"
            >
              <span className="hidden sm:inline">{multi ? 'Latest report' : 'Report'}</span>
              <ArrowRight className="size-3.5" strokeWidth={2.25} />
            </Button>
          </div>
        </div>

        {multi && (
          <CollapsibleContent asChild>
            <ul className="bg-sunken border-t py-1 pr-3 pl-12 sm:pr-6 sm:pl-16">
              {entry.runs.map((run, i) => (
                <RunRow
                  key={run.job_id}
                  run={run}
                  index={entry.runs.length - i} // count down so latest = N, oldest = 1
                  isLatest={i === 0}
                  onOpen={() => onOpen(run.job_id)}
                  onRequestDelete={() =>
                    onRequestDelete({
                      jobId: run.job_id,
                      url: entry.url,
                      startedAt: run.created_at,
                    })
                  }
                />
              ))}
            </ul>
          </CollapsibleContent>
        )}
      </li>
    </Collapsible>
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
      <span className="num text-ink-3 text-code w-8 shrink-0 font-mono">#{index}</span>
      <div className="text-ink-2 text-label min-w-0 flex-1">
        {formatDate(run.created_at, true)}
        {isLatest && <span className="text-link-600 text-caption ml-2 font-semibold">latest</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <DeleteButton onClick={onRequestDelete} />
        <JobStatusChip status={run.status} />
        <Button
          variant="ghost"
          size="quiet"
          onClick={onOpen}
          aria-label="Open report"
          className="text-label ml-1.5 sm:ml-2"
        >
          <span className="hidden sm:inline">Report</span>
          <ArrowRight className="size-3.5" strokeWidth={2.25} />
        </Button>
      </div>
    </li>
  );
}

// trash affordance shared by both rows: quiet until hovered/focused on desktop
function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Delete crawl"
      title="Delete crawl"
      className="hover:bg-bad-bg hover:text-bad-fg focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <Trash2 />
    </Button>
  );
}
