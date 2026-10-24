import { useEffect, useRef, useState } from 'react';

import { ExternalLink, Trash2 } from 'lucide-react';

import type { Status } from '../api';
import { formatDate } from '../lib/format';
import { isTerminalStatus, jobStatusChip, jobStatusLabel } from '../lib/status';

// run header: domain + status; the live progress panel only while the crawl runs
export function ProgressView({
  status,
  onDelete,
}: {
  status: Status | null;
  onDelete?: () => void;
}) {
  const delta = useCheckedDelta(status?.checked ?? 0, isTerminalStatus(status?.status));

  if (!status) {
    return <ProgressSkeleton />;
  }
  const { discovered, checked, healthy, rotten, status: state, url, created_at } = status;
  const isDone = isTerminalStatus(state);
  // a stopped/failed crawl that never caught up keeps a thin bar so the gap stays visible
  const shortOfDone = isDone && checked < discovered;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-8 pt-8 sm:px-8 sm:pt-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-[28px] font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
              {hostOf(url)}
            </h1>
            <span className={`chip ${jobStatusChip(state)}`}>
              {!isDone && <span className="live-dot size-1.5 rounded-full bg-current" />}
              {jobStatusLabel(state)}
            </span>
          </div>
          <p className="num mt-1 text-sm text-ink-3">
            {isDone && (
              <>
                Checked {checked.toLocaleString()} of {discovered.toLocaleString()} pages found
                ·{' '}
              </>
            )}
            Started {formatDate(created_at, true)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <a href={url} target="_blank" rel="noreferrer" className="btn-quiet">
            <ExternalLink className="size-4" strokeWidth={2} aria-hidden="true" />
            Open site
          </a>
          {onDelete && (
            <button onClick={onDelete} className="btn-quiet hover:!bg-bad-bg hover:!text-bad-fg">
              <Trash2 className="size-4" strokeWidth={2} aria-hidden="true" />
              Delete
            </button>
          )}
        </div>
      </div>

      {shortOfDone && (
        <div className="-mt-4 px-5 pb-8 sm:px-8">
          <Bar discovered={discovered} healthy={healthy} rotten={rotten} />
        </div>
      )}

      {!isDone && (
        <div className="panel">
          <div className="px-5 py-5 sm:px-8">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[15px] font-medium">
                Checking <span className="num">{checked.toLocaleString()}</span>
                <span className="text-ink-3"> of </span>
                <span className="num">{discovered.toLocaleString()}</span> pages found
              </p>
              <span className="num font-mono text-sm text-ink-2">
                {discovered > 0 ? Math.round((checked / discovered) * 100) : 0}%
              </span>
            </div>
            <div className="mt-3">
              <Bar discovered={discovered} healthy={healthy} rotten={rotten} />
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-4 sm:[&>div:not(:last-child)]:border-r max-sm:[&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r [&>div]:border-line [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-8">
            <Count label="Found" value={discovered} />
            <Count
              label="Checked"
              value={checked}
              note={delta > 0 ? `+${delta.toLocaleString()}` : undefined}
            />
            <Count label="Healthy" value={healthy} dot="bg-ok-dot" />
            <Count label="Broken" value={rotten} dot="bg-bad-dot" tone="text-bad-fg" />
          </dl>
          <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3 sm:px-8">
            This page updates by itself as pages are checked, and the full report appears once the
            crawl finishes.
          </p>
        </div>
      )}
    </section>
  );
}

function Bar({
  discovered,
  healthy,
  rotten,
}: {
  discovered: number;
  healthy: number;
  rotten: number;
}) {
  const seg = (n: number) => (discovered > 0 ? (n / discovered) * 100 : 0);
  const pct = discovered > 0 ? Math.round(((healthy + rotten) / discovered) * 100) : 0;
  return (
    <div
      className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Crawl progress"
    >
      <div
        className="h-full bg-ok-dot transition-[width] duration-700"
        style={{ width: `${seg(healthy)}%` }}
      />
      <div
        className="h-full bg-bad-dot transition-[width] duration-700"
        style={{ width: `${seg(rotten)}%` }}
      />
    </div>
  );
}

// growth in checked since the previous poll, for the live "+N" beside the count
function useCheckedDelta(checked: number, done: boolean): number {
  const prev = useRef(checked);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    setDelta(done ? 0 : Math.max(0, checked - prev.current));
    prev.current = checked;
  }, [checked, done]);
  return delta;
}

function Count({
  label,
  value,
  dot,
  tone = 'text-ink',
  note,
}: {
  label: string;
  value: number;
  dot?: string;
  tone?: string;
  note?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[13px] font-medium text-ink-3">
        {dot && <span className={`size-2 rounded-full ${dot}`} />}
        {label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        {/* key on value so each change replays the tick */}
        <span
          key={value}
          className={`num inline-block animate-tick text-[28px] font-bold tracking-[-0.03em] ${tone}`}
        >
          {value.toLocaleString()}
        </span>
        {note && <span className="num font-mono text-[11px] font-medium text-ok-fg">{note}</span>}
      </dd>
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading crawl">
      <div className="px-5 pb-8 pt-10 sm:px-8">
        <div className="h-10 w-64 animate-pulse rounded-control bg-line" />
      </div>
      <div className="panel h-[168px] animate-pulse" />
    </section>
  );
}

// "https://www.example.com/" -> "www.example.com"
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
