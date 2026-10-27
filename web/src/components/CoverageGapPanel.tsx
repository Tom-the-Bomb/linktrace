import { ChevronRight, CircleCheck } from 'lucide-react';

import type { CoverageGap } from '../api';
import { SectionHeader } from './SectionHeader';
import { Badge } from './ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

// max URLs listed before collapsing into a "...and N more" line
const CAP = 50;

// sitemap vs crawled diff; always renders all three rows (empty ones read as clear)
export function CoverageGapPanel({ gap }: { gap: CoverageGap }) {
  const total = gap.orphans.length + gap.not_crawled.length + gap.sitemap_dead.length;

  return (
    <section>
      <SectionHeader
        title="Sitemap coverage"
        subtitle={
          total === 0
            ? 'Your sitemap and the crawl agree.'
            : `${total.toLocaleString()} ${total === 1 ? 'difference' : 'differences'} between your sitemap and the crawl.`
        }
      />
      <div className="panel divide-line divide-y">
        <GapList
          label="Not in sitemap"
          hint="Crawled, but missing from sitemap.xml"
          urls={gap.orphans}
          tone="warn"
        />
        <GapList
          label="Never reached"
          hint="Listed in the sitemap, but the crawl never reached it"
          urls={gap.not_crawled}
          tone="warn"
        />
        <GapList
          label="Dead in sitemap"
          hint="Listed in the sitemap, but broken"
          urls={gap.sitemap_dead}
          tone="bad"
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
  tone: 'warn' | 'bad';
}) {
  const empty = urls.length === 0;

  const header = (
    <>
      <span className="min-w-0">
        <span className="text-body block font-semibold">{label}</span>
        <span className="text-ink-3 text-label block">{hint}</span>
      </span>
      {empty ? (
        <Badge variant="ok">
          <CircleCheck className="size-3" strokeWidth={2.5} aria-hidden="true" />
          none
        </Badge>
      ) : (
        <span className="flex items-center gap-2">
          <Badge variant={tone === 'bad' ? 'bad' : 'warn'} mono className="num">
            {urls.length.toLocaleString()}
          </Badge>
          <ChevronRight
            className="text-ink-3 size-4 transition-transform group-data-[state=open]:rotate-90"
            strokeWidth={2.25}
            aria-hidden="true"
          />
        </span>
      )}
    </>
  );

  if (empty) {
    return (
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-8">{header}</div>
    );
  }
  return (
    <Collapsible className="group">
      <CollapsibleTrigger className="hover:bg-sunken flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition sm:px-8">
        {header}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="border-line bg-sunken/60 max-h-80 space-y-1 overflow-y-auto border-t px-5 py-3 sm:px-8">
          {urls.slice(0, CAP).map((u) => (
            <li key={u} className="text-caption truncate font-mono">
              <a
                href={u}
                target="_blank"
                rel="noreferrer"
                className="tap-area text-ink-2 hover:text-link-600 hover:underline"
              >
                {u}
              </a>
            </li>
          ))}
          {urls.length > CAP && (
            <li className="text-ink-3 text-label pt-1">
              …and {(urls.length - CAP).toLocaleString()} more
            </li>
          )}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
