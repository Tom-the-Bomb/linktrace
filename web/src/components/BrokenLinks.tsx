import { useMemo, useState } from 'react';

import { ArrowUpRight, CircleCheck, CornerDownRight, Download } from 'lucide-react';

import type { PageRow } from '../api';
import { usePagination } from '../hooks/usePagination';
import { downloadCsv, toCsv } from '../lib/csv';
import { failureGroup, failureReason, pageStatusLabel } from '../lib/status';
import { hostSlug, pathOf } from '../lib/url';
import { SectionHeader } from './SectionHeader';
import { Pager } from './ui/Pager';
import { StatusChip } from './ui/StatusChip';
import { Button } from './ui/button';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

const PAGE_SIZE = 15;

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
        failureReason(r.error_type, r.status_code),
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
            : 'Each broken page is listed with the page it was first found on. Fix the link there first (other pages may link to it too).'
        }
        right={
          broken.length > 0 && (
            <Button variant="secondary" onClick={exportCsv}>
              <Download />
              Download CSV
            </Button>
          )
        }
      />

      {broken.length === 0 ? (
        <div className="panel text-ink-2 text-body gutter flex items-center gap-3 py-5">
          <CircleCheck className="text-ok-dot size-5 shrink-0" />
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

          <ul className="divide-y">
            {paged.map((r) => {
              const parent = foundOn.get(r.url);
              return (
                <li
                  key={r.url}
                  className="hover:bg-sunken gutter grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-3.5 transition sm:grid-cols-[minmax(0,1fr)_8.75rem_8rem] sm:items-center"
                >
                  <div className="min-w-0">
                    <button
                      onClick={() => onSelect(r.url)}
                      title={r.url}
                      className="tap-area text-label block max-w-full truncate text-left font-mono underline-offset-4 hover:underline"
                    >
                      {pathOf(r.url)}
                    </button>
                    <p className="text-ink-3 text-label mt-0.5 flex items-center gap-1.5">
                      <CornerDownRight className="size-3.5 shrink-0" />
                      {parent ? (
                        <>
                          <span className="shrink-0">First found on</span>
                          <button
                            onClick={() => onSelect(parent)}
                            title={parent}
                            className="tap-area text-link-600 text-caption min-w-6 truncate text-left font-mono underline-offset-4 hover:underline"
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
                        className="tap-area text-link-600 text-label inline-flex items-center gap-1 whitespace-nowrap underline-offset-4 hover:underline"
                      >
                        Wayback copy
                        <ArrowUpRight className="size-3.5" />
                      </a>
                    ) : (
                      <span className="text-ink-3 text-label">No saved copy</span>
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
