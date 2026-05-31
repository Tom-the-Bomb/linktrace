import { useState } from 'react';

import type { CoverageGap } from '../api';
import { SectionHeader } from './SectionHeader';

// sitemap vs crawled set difference. always renders all three sections; empty ones show a green 0.
export function CoverageGapPanel({ gap }: { gap: CoverageGap }) {
  const total = gap.orphans.length + gap.not_crawled.length + gap.sitemap_dead.length;

  return (
    <section>
      <SectionHeader
        number="07"
        title="Sitemap coverage"
        subtitle={total === 0 ? 'no discrepancies' : `${total} discrepancies`}
      />
      {total === 0 && (
        <p className="mb-4 border-l-2 border-emerald-400/50 bg-emerald-500/5 px-3 py-2 font-mono text-[11px] text-emerald-300">
          Sitemap and crawl agree. Nothing missing on either side.
        </p>
      )}

      <div className="space-y-3">
        <GapList label="orphaned" hint="crawled, not in sitemap" urls={gap.orphans} tone="amber" />
        <GapList
          label="missed"
          hint="in sitemap, never reached"
          urls={gap.not_crawled}
          tone="amber"
        />
        <GapList
          label="dead in sitemap"
          hint="listed but rotten"
          urls={gap.sitemap_dead}
          tone="rose"
        />
      </div>
    </section>
  );
}

function GapList({
  label,
  hint,
  urls,
  tone,
}: {
  label: string;
  hint: string;
  urls: string[];
  tone: 'amber' | 'rose';
}) {
  const [open, setOpen] = useState(false);
  if (urls.length === 0) {
    return (
      <div className="flex items-baseline justify-between border-l-2 border-ink-500/60 px-4 py-2 font-mono text-xs">
        <div>
          <span className="text-paper/80">{label}</span>{' '}
          <span className="text-ink-400">{hint}</span>
        </div>
        <span className="text-emerald-300">0</span>
      </div>
    );
  }
  const accent = tone === 'rose' ? 'border-rose-400/60' : 'border-amber-400/60';
  const countColour = tone === 'rose' ? 'text-rose-300' : 'text-amber-300';
  return (
    <div className={`border-l-2 ${accent} bg-ink-700/20`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-baseline justify-between px-4 py-2 font-mono text-xs transition hover:bg-ink-600/30"
      >
        <div>
          <span className="text-paper/80">{label}</span>{' '}
          <span className="text-ink-400">{hint}</span>
        </div>
        <span className={`tabular-nums ${countColour}`}>
          {urls.length} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <ul className="space-y-1 border-t border-ink-500/40 px-4 py-2">
          {urls.slice(0, 50).map((u) => (
            <li key={u} className="truncate font-mono text-[11px]">
              <a
                href={u}
                target="_blank"
                rel="noreferrer"
                className="text-ink-300 hover:text-accent"
              >
                {u}
              </a>
            </li>
          ))}
          {urls.length > 50 && (
            <li className="font-mono text-[10px] text-ink-400">...and {urls.length - 50} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
