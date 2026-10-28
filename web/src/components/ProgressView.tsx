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

export function ProgressView({
  status,
  onDelete,
  onRecrawl,
  recrawling,
}: {
  status: Status | null;
  onDelete?: () => void;
  onRecrawl: () => void;
  recrawling: boolean;
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
      // clipboard blocked; the address bar still has the link
    }
  }

  if (!status) {
    return <ProgressSkeleton />;
  }
  const { discovered, checked, healthy, rotten, status: state, url, created_at } = status;
  const isDone = isTerminalStatus(state);
  // keeps a bar so an unfinished crawl's gap stays visible
  const shortOfDone = isDone && checked < discovered;

  return (
    <section>
      <div className="gutter flex flex-wrap items-start justify-between gap-3 py-8 sm:pt-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title truncate">{hostOf(url)}</h1>
            {/* announces the change when the crawl finishes or stops */}
            <span role="status" className="flex">
              <JobStatusChip status={state} />
            </span>
          </div>
          <p className="text-ink-3 mt-1 text-sm tabular-nums">
            {isDone && (
              <>
                Checked {checked.toLocaleString()} of the {discovered.toLocaleString()} pages
                found.{' '}
              </>
            )}
            Started {formatDate(created_at, true)}.
          </p>
        </div>
        {/* offsets the buttons' padding so icons line up with the content edges */}
        <div className="-mx-2 flex flex-wrap items-center gap-1">
          {isDone && (
            <Button variant="ghost" size="quiet" onClick={onRecrawl} disabled={recrawling}>
              {recrawling ? <Spinner aria-hidden="true" /> : <RotateCw />}
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
            {copied ? <Check className="text-ok-fg" strokeWidth={2.25} /> : <Link />}
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
          <Button variant="ghost" size="quiet" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink />
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
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      </div>

      {shortOfDone && (
        <div className="gutter -mt-4 pb-8">
          <Bar discovered={discovered} healthy={healthy} rotten={rotten} />
        </div>
      )}

      {/* without interpolate-size support it fades instead of folding */}
      <div
        className={`panel transition-[height,opacity,display] transition-discrete duration-400 ease-in-out [interpolate-size:allow-keywords] ${isDone ? 'hidden h-0 overflow-hidden opacity-0' : ''}`}
      >
        <div className="gutter py-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-body font-medium">
              Checking <span className="tabular-nums">{checked.toLocaleString()}</span>
              <span className="text-ink-3"> of </span>
              <span className="tabular-nums">{discovered.toLocaleString()}</span> pages found
            </p>
            <span className="text-ink-2 font-mono text-sm">{pct(checked, discovered)}%</span>
          </div>
          <div className="mt-3">
            <Bar discovered={discovered} healthy={healthy} rotten={rotten} />
          </div>
        </div>
        <dl className="[&>div]:gutter grid grid-cols-2 border-t sm:grid-cols-4 [&>div]:py-4 sm:[&>div:not(:last-child)]:border-r max-sm:[&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r">
          <Count label="Found" value={discovered} />
          <Count
            label="Checked"
            value={checked}
            note={delta > 0 ? `+${delta.toLocaleString()}` : undefined}
          />
          <Count label="Healthy" value={healthy} dot="bg-ok-dot" />
          <Count label="Broken" value={rotten} dot="bg-bad-dot" tone="text-bad-fg" />
        </dl>
        <p className="text-ink-3 text-label gutter border-t py-3">
          This page updates as pages are checked, and the full report appears when the crawl
          finishes.
        </p>
      </div>
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
      className="bg-sunken ring-line flex h-2.5 gap-0.5 overflow-hidden rounded-full ring-1 forced-color-adjust-none ring-inset"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct(healthy + rotten, discovered)}
      aria-label="Crawl progress"
    >
      <div
        className="bg-ok-dot ease-out-expo h-full transition-[width] duration-700"
        style={{ width: `${seg(healthy)}%` }}
      />
      <div
        className="bg-bad-dot ease-out-expo h-full transition-[width] duration-700"
        style={{ width: `${seg(rotten)}%` }}
      />
    </div>
  );
}

// keyed on the status object, which every poll replaces, so a stalled crawl drops to 0
function useCheckedDelta(status: Status | null): number {
  const prev = useRef<Status | null>(null);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    if (!status) {
      return;
    }
    // same running crawl only, so the first poll isn't "+everything"
    const last = prev.current;
    const live = last?.job_id === status.job_id && !isTerminalStatus(status.status);
    setDelta(live ? Math.max(0, status.checked - last.checked) : 0);
    prev.current = status;
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
      <dt className="text-ink-3 text-label flex items-center gap-1.5 font-medium">
        {dot && <span className={`size-2 rounded-full forced-color-adjust-none ${dot}`} />}
        {label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        {/* key on value so each change replays the tick */}
        <span
          key={value}
          className={`animate-tick text-headline tracking-headline inline-block font-semibold tabular-nums ${tone}`}
        >
          {value.toLocaleString()}
        </span>
        {note && <span className="text-ok-fg text-code font-mono font-medium">{note}</span>}
      </dd>
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading crawl">
      <div className="gutter pt-10 pb-8">
        <div className="rounded-control bg-line h-10 w-64 animate-pulse" />
      </div>
      <div className="panel h-42 animate-pulse" />
    </section>
  );
}
