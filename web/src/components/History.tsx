import { useEffect, useState } from 'react';

import { ArrowRight, ChevronRight, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { type HistoryEntry, type HistoryRun, deleteJob, getHistory } from '../api';
import { errMessage, formatDate } from '../lib/format';
import { hostOf } from '../lib/url';
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

export function History() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    getHistory()
      .then(setEntries)
      .catch((e) => setError(errMessage(e)));
  }, []);

  async function confirmDelete(jobId: string) {
    await deleteJob(jobId);
    setEntries(
      (prev) =>
        prev &&
        prev
          .map((e) => ({ ...e, runs: e.runs.filter((r) => r.job_id !== jobId) }))
          .filter((e) => e.runs.length > 0),
    );
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
            <HistoryRow key={e.url} entry={e} onRequestDelete={setPendingDelete} />
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
  onRequestDelete,
}: {
  entry: HistoryEntry;
  onRequestDelete: (target: DeleteTarget) => void;
}) {
  const latest = entry.runs[0];
  const multi = entry.runs.length > 1;
  const [open, setOpen] = useState(false);

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <li>
        {/* the chevron stays the keyboard control; clicks elsewhere on the row toggle too */}
        <div
          className={`group hover:bg-sunken flex flex-wrap items-center gap-3 p-3 transition sm:px-6 ${multi ? 'cursor-pointer' : ''}`}
          onClick={(e) => {
            if (multi && !(e.target as Element).closest('a, button')) {
              setOpen((o) => !o);
            }
          }}
        >
          {multi ? (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Runs of ${hostOf(entry.url)}`}
                className="size-7"
              >
                <ChevronRight
                  className="transition-transform [[data-state=open]>&]:rotate-90"
                  strokeWidth={2.25}
                />
              </Button>
            </CollapsibleTrigger>
          ) : (
            <span className="w-7 shrink-0" />
          )}
          <div className="min-w-24 flex-1">
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="tap-area hover:text-link-600 block w-fit max-w-full truncate font-mono text-sm font-medium hover:underline"
            >
              {entry.url}
            </a>
            <p className="text-ink-3 text-label mt-0.5 tabular-nums">
              {entry.runs.length} {multi ? 'runs' : 'run'}, last on {formatDate(latest.created_at)}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* first, so its hidden space sits in the row's empty middle */}
            <DeleteButton
              label={`Delete crawl of ${hostOf(entry.url)}`}
              onClick={() =>
                onRequestDelete({
                  jobId: latest.job_id,
                  url: entry.url,
                  startedAt: latest.created_at,
                })
              }
            />
            <JobStatusChip status={latest.status} />
            <Button
              variant="secondary"
              size="sm"
              aria-label={`${multi ? 'Open latest report' : 'Open report'} for ${hostOf(entry.url)}`}
              className="ml-1.5 sm:ml-2 sm:px-3"
              asChild
            >
              <Link to={`/jobs/${latest.job_id}`}>
                <span className="hidden sm:inline">{multi ? 'Latest report' : 'Report'}</span>
                <ArrowRight className="size-3.5" strokeWidth={2.25} />
              </Link>
            </Button>
          </div>
        </div>

        {multi && (
          <CollapsibleContent asChild>
            <ul className="bg-sunken border-t py-1 pr-3 pl-13 sm:pr-6 sm:pl-16">
              {entry.runs.map((run, i) => (
                <RunRow
                  key={run.job_id}
                  run={run}
                  index={entry.runs.length - i}
                  isLatest={i === 0}
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
  onRequestDelete,
}: {
  run: HistoryRun;
  index: number;
  isLatest: boolean;
  onRequestDelete: () => void;
}) {
  return (
    <li className="group flex flex-wrap items-center gap-3 py-2">
      <span className="text-ink-3 text-code w-8 shrink-0 font-mono">#{index}</span>
      <div className="text-ink-2 text-label min-w-24 flex-1">
        {formatDate(run.created_at, true)}
        {isLatest && <span className="text-link-600 text-caption ml-2 font-semibold">latest</span>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
        <DeleteButton label={`Delete run #${index}`} onClick={onRequestDelete} />
        <JobStatusChip status={run.status} />
        <Button
          variant="ghost"
          size="quiet"
          aria-label={`Open report #${index}`}
          className="text-label ml-1.5 sm:ml-2"
          asChild
        >
          <Link to={`/jobs/${run.job_id}`}>
            <span className="hidden sm:inline">Report</span>
            <ArrowRight className="size-3.5" strokeWidth={2.25} />
          </Link>
        </Button>
      </div>
    </li>
  );
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title="Delete crawl"
      className="hover:bg-bad-bg hover:text-bad-fg focus-visible:opacity-100 sm:group-hover:opacity-100 sm:pointer-fine:opacity-0"
    >
      <Trash2 />
    </Button>
  );
}
