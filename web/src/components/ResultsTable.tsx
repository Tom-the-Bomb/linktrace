import { useMemo, useState } from 'react';

import { ArrowDown, ArrowUp, Download, ExternalLink, Search } from 'lucide-react';

import type { PageRow } from '../api';
import { usePagination } from '../hooks/usePagination';
import { scoreTextColour } from '../lib/colours';
import { downloadCsv, toCsv } from '../lib/csv';
import { pageStatusLabel } from '../lib/status';
import { hostSlug, pathOf, sectionOf } from '../lib/url';
import { Pager } from './ui/Pager';
import { SectionDot } from './ui/SectionDot';
import { StatusChip } from './ui/StatusChip';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

type Filter = 'all' | 'healthy' | 'rotten';
type SortKey = 'depth' | 'seo' | 'response';
const SORT_LABEL: Record<SortKey, string> = { depth: 'Depth', seo: 'SEO', response: 'Response' };
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;
const FILTER_LABEL: Record<Filter, string> = { all: 'All', healthy: 'Healthy', rotten: 'Broken' };

// every crawled page; row click opens the SEO drawer
export function ResultsTable({
  rows,
  onSelect,
  colourFor,
  siteUrl,
  foundOn,
}: {
  rows: PageRow[];
  onSelect: (url: string) => void;
  colourFor: (section: string) => string;
  siteUrl: string;
  // url -> page it was first found on, for the export
  foundOn: Map<string, string>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('depth');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const counts = useMemo(() => {
    const rotten = rows.filter((r) => !r.is_alive).length;
    return { all: rows.length, healthy: rows.length - rotten, rotten };
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === 'rotten') {
      r = r.filter((x) => !x.is_alive);
    } else if (filter === 'healthy') {
      r = r.filter((x) => x.is_alive);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter((x) => x.url.toLowerCase().includes(q));
    }
    return r;
  }, [rows, filter, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'seo') {
        // no-score pages always sink to the bottom, regardless of direction
        if (a.seo_score === null) {
          return b.seo_score === null ? 0 : 1;
        }
        if (b.seo_score === null) {
          return -1;
        }
        return (a.seo_score - b.seo_score) * dir;
      }
      if (sortKey === 'response') {
        return (a.response_time - b.response_time) * dir;
      }
      return (a.depth - b.depth) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  // exports what the filters and search currently show, in the current sort order
  function exportCsv() {
    const csv = toCsv(
      ['url', 'status', 'seo_score', 'depth', 'response_ms', 'first_found_on', 'wayback_copy'],
      sorted.map((r) => [
        r.url,
        pageStatusLabel(r.is_alive, r.status_code, r.error_type),
        r.seo_score,
        r.depth,
        r.response_time,
        foundOn.get(r.url) ?? '',
        r.archive_url,
      ]),
    );
    downloadCsv(`linktrace-${hostSlug(siteUrl)}-pages.csv`, csv);
  }

  const { page, setPage, paged } = usePagination(sorted, PAGE_SIZE);

  // filter, search and sort all go back to page 1
  function pickFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  function onQueryChange(v: string) {
    setQuery(v);
    setPage(1);
  }

  function pickSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      // response is sorted to find slow pages, so it starts slowest-first
      setSortDir(k === 'response' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  const DirIcon = sortDir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <section className="panel">
      <header className="panel-head">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && pickFilter(v as Filter)}
          aria-label="Filter pages"
        >
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <ToggleGroupItem key={f} value={f} count={counts[f]}>
              {FILTER_LABEL[f]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <InputGroup className="flex-1 sm:w-56 sm:flex-none">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search pages by URL"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search URLs"
            />
          </InputGroup>
          {/* clicking the active key again flips the direction */}
          <ToggleGroup
            type="single"
            value={sortKey}
            onValueChange={(v) => pickSort((v || sortKey) as SortKey)}
            aria-label="Sort pages"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <ToggleGroupItem key={k} value={k}>
                {SORT_LABEL[k]}
                {sortKey === k && (
                  <DirIcon
                    className="size-3.5"
                    strokeWidth={2.5}
                    aria-label={sortDir === 'asc' ? 'ascending' : 'descending'}
                  />
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            variant="secondary"
            onClick={exportCsv}
            disabled={sorted.length === 0}
            title="Download the pages shown as CSV"
          >
            <Download />
            CSV
          </Button>
        </div>
      </header>

      {sorted.length === 0 ? (
        <p className="text-ink-3 text-body px-6 py-10 text-center">No pages match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5 sm:pl-8">Page</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Depth</TableHead>
              <TableHead className="text-right">Response</TableHead>
              <TableHead className="text-right">SEO</TableHead>
              <TableHead className="pr-5 sm:pr-8">Archive</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((r) => (
              <TableRow
                key={r.url}
                onClick={() => onSelect(r.url)}
                onKeyDown={(e) =>
                  (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(r.url))
                }
                tabIndex={0}
                aria-label={`Open audit for ${r.url}`}
                className="focus-visible:bg-sunken cursor-pointer focus-visible:outline-hidden"
              >
                <TableCell className="max-w-md pl-5 sm:pl-8">
                  <span className="flex items-center gap-2.5" title={r.url}>
                    <SectionDot colour={colourFor(sectionOf(r.url))} />
                    <span className="text-label truncate font-mono">{pathOf(r.url)}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <StatusChip alive={r.is_alive} code={r.status_code} error={r.error_type} />
                </TableCell>
                <TableCell className="num text-ink-2 text-label text-right font-mono">
                  {r.depth}
                </TableCell>
                <TableCell className="num text-ink-2 text-label text-right font-mono whitespace-nowrap">
                  {r.response_time > 0 ? `${r.response_time.toLocaleString()} ms` : 'None'}
                </TableCell>
                <TableCell
                  className={`num text-label text-right font-mono font-medium ${scoreTextColour(r.seo_score)}`}
                >
                  {r.seo_score ?? 'n/a'}
                </TableCell>
                <TableCell className="pr-5 sm:pr-8">
                  {r.archive_url ? (
                    <a
                      href={r.archive_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="tap-area text-link-600 hover:text-link-700 text-label inline-flex items-center gap-1 font-medium whitespace-nowrap hover:underline"
                    >
                      Wayback
                      <ExternalLink className="size-3" strokeWidth={2.25} />
                    </a>
                  ) : (
                    <span className="text-ink-3 text-label">None</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pager page={page} total={sorted.length} size={PAGE_SIZE} onPage={setPage} />
    </section>
  );
}
