import { useEffect, useRef, useState } from 'react';

import { Check, ExternalLink, Link, RotateCw, Trash2 } from 'lucide-react';

import type { Status } from '../api';
import { pct } from '../lib/colours';
import { formatDate } from '../lib/format';
import { isTerminalStatus } from '../lib/status';
import { hostOf } from '../lib/url';
import { JobStatusChip } from './ui/StatusChip';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

// run header: domain + status; the live progress panel only while the crawl runs
export function ProgressView({
  status,
  onDelete,
  onRecrawl,
  recrawling,
}: {
  status: Status | null;
  onDelete?: () => void;
  // start a fresh crawl of the same site
  onRecrawl?: () => void;
  recrawling?: boolean;
}) {
  const delta = useCheckedDelta(status);
  const [copied, setCopied] = useState(false);

  // reports are public by id, so the page url is the share link
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (insecure origin or denied); the address bar still has the link
    }
  }

  if (!status) {
    return <ProgressSkeleton />;
  }
  const { discovered, checked, healthy, rotten, status: state, url, created_at } = status;
  const isDone = isTerminalStatus(state);
  // a stopped/failed crawl that never caught up keeps a thin bar so the gap stays visible
  const shortOfDone = isDone && checked < discovered;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-8 pb-8 sm:px-8 sm:pt-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-[28px] leading-tight font-semibold tracking-[-0.035em] sm:text-4xl sm:leading-10">
              {hostOf(url)}
            </h1>
            <JobStatusChip status={state} />
          </div>
          <p className="num text-ink-3 mt-1 text-sm">
            {isDone && (
              <>
                Checked {checked.toLocaleString()} of the {discovered.toLocaleString()} pages
                found.{' '}
              </>
            )}
            Started {formatDate(created_at, true)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {isDone && onRecrawl && (
            <Button variant="ghost" size="quiet" onClick={onRecrawl} disabled={recrawling}>
              {recrawling ? (
                <Spinner aria-hidden="true" />
              ) : (
                <RotateCw strokeWidth={2} aria-hidden="true" />
              )}
              Crawl again
            </Button>
          )}
          <Button
            variant="ghost"
            size="quiet"
            onClick={copyLink}
            aria-live="polite"
            title="Anyone with the link can view this report"
          >
            {copied ? (
              <Check className="text-ok-fg" strokeWidth={2.25} aria-hidden="true" />
            ) : (
              <Link strokeWidth={2} aria-hidden="true" />
            )}
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
          <Button variant="ghost" size="quiet" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink strokeWidth={2} aria-hidden="true" />
              Open site
            </a>
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="quiet"
              onClick={onDelete}
              className="hover:bg-bad-bg hover:text-bad-fg"
            >
              <Trash2 strokeWidth={2} aria-hidden="true" />
              Delete
            </Button>
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
              <span className="num text-ink-2 font-mono text-sm">{pct(checked, discovered)}%</span>
            </div>
            <div className="mt-3">
              <Bar discovered={discovered} healthy={healthy} rotten={rotten} />
            </div>
          </div>
          <dl className="border-line [&>div]:border-line grid grid-cols-2 border-t sm:grid-cols-4 [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-8 sm:[&>div:not(:last-child)]:border-r max-sm:[&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r">
            <Count label="Found" value={discovered} />
            <Count
              label="Checked"
              value={checked}
              note={delta > 0 ? `+${delta.toLocaleString()}` : undefined}
            />
            <Count label="Healthy" value={healthy} dot="bg-ok-dot" />
            <Count label="Broken" value={rotten} dot="bg-bad-dot" tone="text-bad-fg" />
          </dl>
          <p className="border-line text-ink-3 border-t px-5 py-3 text-[13px] sm:px-8">
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
  return (
    <div
      className="bg-sunken ring-line flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full ring-1 ring-inset"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct(healthy + rotten, discovered)}
      aria-label="Crawl progress"
    >
      <div
        className="bg-ok-dot h-full transition-[width] duration-700"
        style={{ width: `${seg(healthy)}%` }}
      />
      <div
        className="bg-bad-dot h-full transition-[width] duration-700"
        style={{ width: `${seg(rotten)}%` }}
      />
    </div>
  );
}

// growth in checked since the previous poll, for the live "+N" beside the count. Keyed on the
// status object, which every poll replaces, so a stalled crawl drops back to no delta.
function useCheckedDelta(status: Status | null): number {
  const prev = useRef(0);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    if (!status) {
      return;
    }
    setDelta(isTerminalStatus(status.status) ? 0 : Math.max(0, status.checked - prev.current));
    prev.current = status.checked;
  }, [status]);
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
      <dt className="text-ink-3 flex items-center gap-1.5 text-[13px] font-medium">
        {dot && <span className={`size-2 rounded-full ${dot}`} />}
        {label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        {/* key on value so each change replays the tick */}
        <span
          key={value}
          className={`num animate-tick inline-block text-[28px] font-bold tracking-[-0.03em] ${tone}`}
        >
          {value.toLocaleString()}
        </span>
        {note && <span className="num text-ok-fg font-mono text-[11px] font-medium">{note}</span>}
      </dd>
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading crawl">
      <div className="px-5 pt-10 pb-8 sm:px-8">
        <div className="rounded-control bg-line h-10 w-64 animate-pulse" />
      </div>
      <div className="panel h-42 animate-pulse" />
    </section>
  );
}
