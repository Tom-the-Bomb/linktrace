import { useEffect, useState } from 'react';

import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { type HistoryEntry, type HistoryRun, getHistory } from '../api';
import { SectionHeader } from './SectionHeader';

// Per-site history. Single-run sites get a flat row with one "view report" button.
// Multi-run sites get a chevron that expands a list of every individual run, each
// with its own report link, plus a "view latest" shortcut on the right.
export function History() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // set of URLs whose run list is currently expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getHistory()
      .then(setEntries)
      .catch((e) => setError(String(e)));
  }, []);

  const toggle = (url: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

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
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryRow({
  entry,
  expanded,
  onToggle,
  onOpen,
}: {
  entry: HistoryEntry;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (jobId: string) => void;
}) {
  const multi = entry.crawl_count > 1;

  return (
    <li>
      <div
        onClick={multi ? onToggle : undefined}
        className={`group grid grid-cols-12 items-center gap-4 py-4 pr-4 transition hover:bg-ink-700/30 ${multi ? 'cursor-pointer' : ''}`}
      >
        {/* chevron column — interactive when multi-run, blank otherwise to keep alignment.
            chevron color is driven by the parent's `group` hover so it lights up when
            you mouse anywhere on the row, matching the row's clickable feel. */}
        <div className="col-span-1 flex justify-center">
          {multi ? (
            <ChevronRight
              className={`h-4 w-4 text-ink-300 transition-transform group-hover:text-accent ${expanded ? 'rotate-90' : ''}`}
              strokeWidth={2}
            />
          ) : null}
        </div>
        {/* wrapper takes the 5-col grid slot; the <a> is inline-block + max-w-full so
            its hover hit-box is only as wide as the visible text, not the whole cell. */}
        <div className="col-span-5 min-w-0">
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            onClick={(ev) => ev.stopPropagation()}
            className="inline-block max-w-full truncate align-middle font-mono text-sm text-paper hover:text-accent"
          >
            {entry.url}
          </a>
        </div>
        <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-ink-300">
          {entry.crawl_count}
          {entry.crawl_count === 1 ? ' run' : ' runs'}
        </div>
        <div className="col-span-2 font-mono text-[10px] text-ink-300">
          {formatDate(entry.last_crawled)}
        </div>
        <div className="col-span-2 text-right">
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onOpen(entry.last_job_id);
            }}
            className="border border-ink-500/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:border-accent hover:text-accent"
          >
            {multi ? 'view latest' : 'view report'}
          </button>
        </div>
      </div>

      {multi && expanded && (
        <ul className="ml-[calc(8.333%+1rem)] border-l border-ink-500/60 py-1 pl-4">
          {entry.runs.map((run, i) => (
            <RunRow
              key={run.job_id}
              run={run}
              index={entry.runs.length - i} // count down so latest = N, oldest = 1
              isLatest={i === 0}
              onOpen={() => onOpen(run.job_id)}
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
}: {
  run: HistoryRun;
  index: number;
  isLatest: boolean;
  onOpen: () => void;
}) {
  return (
    <li className="grid grid-cols-12 items-center gap-4 py-2 pr-4 transition hover:bg-ink-700/30">
      <div className="col-span-1 font-mono text-[10px] tabular-nums text-ink-400">
        #{String(index).padStart(2, '0')}
      </div>
      <div className="col-span-7 font-mono text-[11px] text-ink-300">
        {formatDateTime(run.created_at)}
        {isLatest && (
          <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-accent/70">
            latest
          </span>
        )}
      </div>
      <div className="col-span-4 text-right">
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            onOpen();
          }}
          className="btn-ghost"
        >
          view report →
        </button>
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string): string {
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
