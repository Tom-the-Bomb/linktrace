import { Trash2 } from 'lucide-react';

import type { Status } from '../api';
import { type Tone, toneColour } from '../lib/colours';
import { isTerminalStatus } from '../lib/status';
import { SectionHeader } from './SectionHeader';

// live crawl progress: segmented bar + percentage, stats on the side; onDelete renders a trash button
export function ProgressView({
  status,
  onDelete,
}: {
  status: Status | null;
  onDelete?: () => void;
}) {
  if (!status) {
    return null;
  }
  const { discovered, checked, healthy, rotten, status: state, url } = status;
  const pending = Math.max(0, discovered - checked);
  const isDone = isTerminalStatus(state);
  const pct = discovered > 0 ? (checked / discovered) * 100 : 0;
  const seg = (n: number) => (discovered > 0 ? (n / discovered) * 100 : 0);

  return (
    <section>
      <SectionHeader
        number="01"
        title={state === 'stopped' ? 'Crawl stopped' : isDone ? 'Crawl complete' : 'Crawling'}
        right={
          <div className="flex items-center gap-3">
            {url && <span className="hidden text-xs italic text-ink-300 sm:inline">{url}</span>}
            {onDelete && (
              <button
                onClick={onDelete}
                aria-label="Delete crawl"
                title="Delete crawl"
                className="text-ink-400 transition hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* big featured progress */}
        <div className="lg:col-span-8">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-3">
              <span className="display text-7xl font-light tabular-nums sm:text-8xl">
                {Math.round(pct)}
              </span>
              <span className="display text-3xl font-light text-ink-300">%</span>
            </div>
            <StatusBadge status={state} pulse={!isDone} />
          </div>

          <div className="mt-6 flex h-1 w-full overflow-hidden bg-ink-700">
            <div
              className="h-full bg-emerald-400 transition-all"
              style={{ width: `${seg(healthy)}%` }}
            />
            <div
              className="h-full bg-rose-500 transition-all"
              style={{ width: `${seg(rotten)}%` }}
            />
            <div
              className="h-full bg-ink-500 transition-all"
              style={{ width: `${seg(pending)}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-widest text-ink-300">
            <span>
              {checked} <span className="text-ink-400">/</span> {discovered} checked
            </span>
            <span>{isDone ? 'done' : `${pending} in flight`}</span>
          </div>
        </div>

        {/* stat list */}
        <div className="lg:col-span-4">
          <dl className="divide-y divide-ink-500/60 border-y border-ink-500/60">
            <StatRow label="discovered" value={discovered} />
            <StatRow label="checked" value={checked} />
            <StatRow label="healthy" value={healthy} tone="ok" />
            <StatRow label="rotten" value={rotten} tone="bad" />
          </dl>
        </div>
      </div>
    </section>
  );
}

function StatRow({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className="flex items-baseline justify-between py-4">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-300">{label}</dt>
      <dd className={`display text-3xl font-light tabular-nums ${toneColour(tone)}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status, pulse }: { status: string; pulse: boolean }) {
  const tone: Record<string, string> = {
    pending: 'border-ink-400 text-ink-300',
    crawling: 'border-accent/60 text-accent',
    complete: 'border-emerald-400/60 text-emerald-300',
    failed: 'border-rose-400/60 text-rose-300',
    stopped: 'border-ink-400 text-ink-200',
  };
  return (
    <span className={`chip ${tone[status] ?? tone.pending}`}>
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      <span className="font-mono uppercase tracking-widest">{status}</span>
    </span>
  );
}
