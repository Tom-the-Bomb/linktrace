import { useMemo, useState } from 'react';

import { ArrowUpRight, CircleCheck, CornerDownRight, Download } from 'lucide-react';

import type { PageRow } from '../api';
import { usePagination } from '../hooks/usePagination';
import { downloadCsv, toCsv } from '../lib/csv';
import { FAILURE_EXPLANATION, failureGroup, pageStatusLabel } from '../lib/status';
import { hostSlug, pathOf } from '../lib/url';
import { SectionHeader } from './SectionHeader';
import { Pager } from './ui/Pager';
import { StatusChip } from './ui/StatusChip';
import { Button } from './ui/button';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

const PAGE_SIZE = 15;

// every broken page with the page it was found on, so you know where to make the fix
export function BrokenLinks({
  rows,
  foundOn,
  siteUrl,
  onSelect,
}: {
  rows: PageRow[];
  // url -> the page it was first found on
  foundOn: Map<string, string>;
  siteUrl: string;
  onSelect: (url: string) => void;
}) {
  const broken = useMemo(() => rows.filter((r) => !r.is_alive), [rows]);
  const [group, setGroup] = useState<string>('all');

  // failure groups, most common first
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of broken) {
      const g = failureGroup(r.error_type);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [broken]);

  const filtered = useMemo(
    () => (group === 'all' ? broken : broken.filter((r) => failureGroup(r.error_type) === group)),
    [broken, group],
  );
  const { page, setPage, paged } = usePagination(filtered, PAGE_SIZE);

  function pickGroup(g: string) {
    setGroup(g);
    setPage(1);
  }

  function exportCsv() {
    const csv = toCsv(
      ['broken_url', 'status', 'reason', 'first_found_on', 'depth', 'response_ms', 'wayback_copy'],
      broken.map((r) => [
        r.url,
        pageStatusLabel(false, r.status_code, r.error_type),
        FAILURE_EXPLANATION[r.error_type] ?? '',
        foundOn.get(r.url) ?? '',
        r.depth,
        r.response_time,
        r.archive_url,
      ]),
    );
    downloadCsv(`linktrace-${hostSlug(siteUrl)}-broken-links.csv`, csv);
  }

  return (
    <section>
      <SectionHeader
        title="Broken links"
        subtitle={
          broken.length === 0
            ? 'Every page the crawl reached loaded correctly.'
            : 'Each broken page is listed with the first page the crawl found it on. Start by fixing the link there, though other pages may link to it as well.'
        }
        right={
          broken.length > 0 && (
            <Button variant="secondary" onClick={exportCsv}>
              <Download strokeWidth={2} aria-hidden="true" />
              Download CSV
            </Button>
          )
        }
      />

      {broken.length === 0 ? (
        <div className="panel text-ink-2 flex items-center gap-3 px-5 py-5 text-[15px] sm:px-8">
          <CircleCheck className="text-ok-dot size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
          No broken links found.
        </div>
      ) : (
        <div className="panel">
          {groups.length > 1 && (
            <div className="panel-head">
              <ToggleGroup
                type="single"
                value={group}
                onValueChange={(v) => v && pickGroup(v)}
                aria-label="Filter by failure type"
              >
                <ToggleGroupItem value="all" count={broken.length}>
                  All
                </ToggleGroupItem>
                {groups.map(([g, n]) => (
                  <ToggleGroupItem key={g} value={g} count={n}>
                    {g}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          <ul className="divide-line divide-y">
            {paged.map((r) => {
              const parent = foundOn.get(r.url);
              return (
                <li
                  key={r.url}
                  className="hover:bg-sunken grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-5 py-3.5 transition sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-center sm:px-8"
                >
                  <div className="min-w-0">
                    <button
                      onClick={() => onSelect(r.url)}
                      title={r.url}
                      className="block max-w-full truncate text-left font-mono text-[13px] underline-offset-4 hover:underline"
                    >
                      {pathOf(r.url)}
                    </button>
                    <p className="text-ink-3 mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px]">
                      <CornerDownRight
                        className="size-3.5 shrink-0"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      {parent ? (
                        <>
                          <span className="shrink-0">First found on</span>
                          <button
                            onClick={() => onSelect(parent)}
                            title={parent}
                            className="text-link-600 truncate font-mono text-[12px] underline-offset-4 hover:underline"
                          >
                            {pathOf(parent)}
                          </button>
                        </>
                      ) : (
                        <span>Where the crawl started</span>
                      )}
                    </p>
                  </div>
                  <span className="justify-self-end sm:justify-self-start">
                    <StatusChip alive={false} code={r.status_code} error={r.error_type} />
                  </span>
                  <span className="col-span-2 flex justify-end sm:col-span-1">
                    {r.archive_url ? (
                      <a
                        href={r.archive_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-link-600 inline-flex items-center gap-1 text-[13px] whitespace-nowrap underline-offset-4 hover:underline"
                      >
                        Wayback copy
                        <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-ink-3 hidden text-[13px] sm:inline">No saved copy</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <Pager page={page} total={filtered.length} size={PAGE_SIZE} onPage={setPage} />
        </div>
      )}
    </section>
  );
}
