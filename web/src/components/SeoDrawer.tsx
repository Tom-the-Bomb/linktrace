import { useEffect, useRef, useState } from 'react';

import { ArrowUpRight, Check, ChevronRight, ExternalLink, X } from 'lucide-react';

import { type Issue, type PageRow, type SEODetail, getSEODetail } from '../api';
import { type Tone, pct, scoreTierBadge, toneColour } from '../lib/colours';
import { errMessage } from '../lib/format';
import { type SiteTree, depthLabel, pathFromRoot } from '../lib/graph';
import { failureReason } from '../lib/status';
import { pathOf } from '../lib/url';
import { DataRow } from './ui/DataRow';
import { ErrorBanner } from './ui/ErrorBanner';
import { StatusChip } from './ui/StatusChip';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Kbd } from './ui/kbd';
import { Sheet, SheetClose, SheetContent, SheetTitle } from './ui/sheet';

interface Props {
  jobId: string;
  url: string | null;
  open: boolean;
  row?: PageRow;
  tree: SiteTree;
  onNavigate: (url: string) => void;
  onClose: () => void;
}

export function SeoDrawer({ jobId, url, open, row, tree, onNavigate, onClose }: Props) {
  const [detail, setDetail] = useState<SEODetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // no SheetTrigger for Radix to refocus, so focus is handed back to the opener
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!url || !open) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    getSEODetail(jobId, url)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(errMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jobId, url, open]);

  if (!url) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        aria-describedby={undefined}
        onOpenAutoFocus={() => (opener.current = document.activeElement as HTMLElement | null)}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          opener.current?.focus();
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <SheetTitle className="truncate text-lg font-semibold tracking-tight">
              Audit of <span className="font-mono text-base font-medium">{pathOf(url)}</span>
            </SheetTitle>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-ink-3 hover:text-link-600 text-caption mt-0.5 flex items-center gap-1.5 font-mono"
            >
              <span className="truncate">{url}</span>
              <ExternalLink className="size-3 shrink-0" strokeWidth={2.25} />
            </a>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="quiet" aria-label="Close audit" className="px-1.5">
              <Kbd className="pointer-coarse:hidden">esc</Kbd>
              <X strokeWidth={2.25} />
            </Button>
          </SheetClose>
        </header>

        <div
          role="region"
          aria-label="Audit details"
          tabIndex={0}
          className="flex-1 overflow-y-auto p-5 focus-visible:-outline-offset-2 sm:px-6"
        >
          <PageContext url={url} row={row} tree={tree} onNavigate={onNavigate} />
          {loading && <Skeleton />}
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {!loading && !error && !detail && <NoAuditState />}
          {detail && <SeoBody detail={detail} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PageContext({
  url,
  row,
  tree,
  onNavigate,
}: {
  url: string;
  row?: PageRow;
  tree: SiteTree;
  onNavigate: (url: string) => void;
}) {
  const chain = pathFromRoot(tree, url);
  const foundOn = tree.parent.get(url);
  const foundHere = tree.children.get(url)?.length ?? 0;

  return (
    <section className="mb-7 border-b pb-6">
      {row && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusChip alive={row.is_alive} code={row.status_code} error={row.error_type} />
          <span className="text-ink-3 text-caption font-mono">
            {row.response_time > 0 ? `${row.response_time.toLocaleString()} ms` : 'No response'}
          </span>
          <span className="text-ink-3 text-label">{depthLabel(row.depth)}</span>
        </div>
      )}
      {row && !row.is_alive && (
        <p className="text-ink-2 text-body mt-3 leading-relaxed">
          {failureReason(row.error_type, row.status_code)}
          {row.archive_url ? (
            <>
              {' '}
              <a
                href={row.archive_url}
                target="_blank"
                rel="noreferrer"
                className="text-link-600 inline-flex items-center gap-0.5 underline-offset-4 hover:underline"
              >
                See the saved copy on the Wayback Machine
                <ArrowUpRight className="size-3.5" strokeWidth={2.25} />
              </a>
            </>
          ) : (
            <span className="text-ink-3"> No saved copy on the Wayback Machine.</span>
          )}
        </p>
      )}

      <dl className="mt-5 space-y-4 text-sm">
        <div>
          <dt className="text-ink-3 text-label font-medium">First found on</dt>
          <dd className="mt-1">
            {foundOn ? (
              <button
                onClick={() => onNavigate(foundOn)}
                className="tap-area text-link-600 text-label font-mono underline-offset-4 hover:underline"
              >
                {pathOf(foundOn)}
              </button>
            ) : (
              <span className="text-ink-2">This is where the crawl started.</span>
            )}
            {foundOn && row && !row.is_alive && (
              <span className="text-ink-3 text-label mt-1 block">
                Fix or remove the link on that page (other pages may link to it too).
              </span>
            )}
          </dd>
        </div>
        {chain.length > 2 && (
          <div>
            <dt className="text-ink-3 text-label font-medium">Path from the homepage</dt>
            <dd className="mt-1">
              <ol className="text-caption flex flex-wrap items-center gap-x-1 gap-y-1 font-mono">
                {chain.map((u, i) => (
                  <li key={u} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="text-ink-4 size-3" strokeWidth={2.5} />}
                    {u === url ? (
                      <span className="text-ink" aria-current="page">
                        {pathOf(u)}
                      </span>
                    ) : (
                      <button
                        onClick={() => onNavigate(u)}
                        className="tap-area text-ink-2 hover:text-ink underline-offset-4 hover:underline"
                      >
                        {pathOf(u)}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </dd>
          </div>
        )}
        {foundHere > 0 && (
          <div>
            <dt className="text-ink-3 text-label font-medium">Pages first found here</dt>
            <dd className="num text-ink-2 mt-1">
              {foundHere.toLocaleString()} {foundHere === 1 ? 'page' : 'pages'}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function NoAuditState() {
  return (
    <div>
      <p className="font-semibold">No SEO audit for this page</p>
      <p className="text-ink-2 text-body mt-1.5 leading-relaxed">
        It didn&rsquo;t load as a normal HTML page, so there was nothing to audit.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading audit">
      <div className="bg-sunken h-20 animate-pulse rounded-xl" />
      <div className="bg-sunken h-32 animate-pulse rounded-xl" />
      <div className="bg-sunken h-24 animate-pulse rounded-xl" />
    </div>
  );
}

function SeoBody({ detail }: { detail: SEODetail }) {
  const tier = scoreTierBadge(detail.score);
  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between border-b pb-6">
        <span>
          <span className="text-ink-3 text-label block font-medium">SEO score</span>
          <Badge variant={tier.tone} className="mt-1.5">
            {tier.label}
          </Badge>
        </span>
        <span className="flex items-baseline gap-1">
          <span className="num tracking-display text-5xl font-semibold">{detail.score}</span>
          <span className="text-ink-3 text-base font-semibold">/100</span>
        </span>
      </div>

      {detail.issues && detail.issues.length > 0 && (
        <Section label="Issues" count={detail.issues.length}>
          <ul className="divide-y">
            {detail.issues.map((iss) => (
              <li key={iss.code} className="text-body flex items-start gap-3 py-2.5 leading-snug">
                <Badge variant={SEVERITY_TONE[iss.severity]} className="mt-px">
                  {iss.severity}
                </Badge>
                <span>{iss.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section label="Title">
        <p className="text-lead leading-snug font-semibold">
          {detail.title || <em className="text-bad-fg font-normal not-italic">Missing</em>}
        </p>
        <Meta value={`${detail.title_length} characters`} />
      </Section>

      <Section label="Meta description">
        <p className="text-ink-2 text-body leading-relaxed">
          {detail.meta_description || <em className="text-bad-fg not-italic">Missing</em>}
        </p>
        <Meta value={`${detail.meta_description_length} characters`} />
      </Section>

      <Section label="Headings">
        <div className="rounded-control ring-line grid grid-cols-6 divide-x ring-1 ring-inset">
          <HeadingTile label="h1" count={detail.h1_count} flagged={detail.h1_count !== 1} />
          <HeadingTile label="h2" count={detail.h2_count} />
          <HeadingTile label="h3" count={detail.h3_count} />
          <HeadingTile label="h4" count={detail.h4_count} />
          <HeadingTile label="h5" count={detail.h5_count} />
          <HeadingTile label="h6" count={detail.h6_count} />
        </div>
      </Section>

      <Section label="Signals">
        <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Signal label="Canonical" ok={!!detail.canonical} />
          <Signal label="Viewport" ok={detail.has_viewport} />
          <Signal label="JSON-LD" ok={detail.jsonld_count > 0} />
          <Signal
            label="Open Graph"
            ok={!!detail.og_tags && Object.keys(detail.og_tags).length > 0}
          />
          <Signal
            label="Twitter cards"
            ok={!!detail.twitter_tags && Object.keys(detail.twitter_tags).length > 0}
          />
          <Signal label="Indexable" ok={!detail.noindex} />
          <Signal
            label={`html lang${detail.html_lang ? ` (${detail.html_lang})` : ''}`}
            ok={!!detail.html_lang}
          />
        </ul>
      </Section>

      {detail.images_total > 0 && (
        <Section label="Images" count={detail.images_total}>
          <ul className="divide-y">
            <CountSignal
              label="Alt text"
              count={detail.images_with_alt}
              total={detail.images_total}
            />
            <CountSignal
              label="Width and height"
              count={detail.images_with_dims}
              total={detail.images_total}
            />
            <CountSignal
              label="Lazy loaded"
              count={detail.images_lazy_loaded}
              total={detail.images_total}
            />
            <CountSignal
              label="Responsive (srcset)"
              count={detail.images_responsive}
              total={detail.images_total}
            />
          </ul>
        </Section>
      )}

      {detail.links_internal + detail.links_external > 0 && (
        <Section label="Links">
          <ul className="divide-y">
            <RawStat label="Internal" value={detail.links_internal} />
            <RawStat label="External" value={detail.links_external} />
            <RawStat label="nofollow" value={detail.links_nofollow} />
          </ul>
        </Section>
      )}

      {detail.primary_keyword && (
        <Section label="Keywords">
          <p className="flex items-baseline gap-2">
            <span className="tracking-headline text-2xl font-semibold">
              {detail.primary_keyword}
            </span>
            <span className="text-ink-3 text-label">primary</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Placement label="in title" ok={detail.keyword_in_title} />
            <Placement label="in h1" ok={detail.keyword_in_h1} />
            <Placement label="in URL" ok={detail.keyword_in_url} />
          </div>
          {detail.top_keywords && detail.top_keywords.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {detail.top_keywords.slice(0, 12).map((k) => (
                <Badge key={k.term}>
                  {k.term}
                  <span className="num text-ink-3">{k.count}</span>
                </Badge>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-body mb-2 flex items-baseline gap-2 font-semibold tracking-tight">
        {label}
        {count !== undefined && (
          <span className="text-ink-3 text-caption font-mono font-medium">{count}</span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Meta({ value }: { value: string }) {
  return <p className="text-ink-3 text-code mt-1.5 font-mono">{value}</p>;
}

function HeadingTile({
  label,
  count,
  flagged,
}: {
  label: string;
  count: number;
  flagged?: boolean;
}) {
  return (
    <div className={`p-2 text-center ${flagged ? 'bg-bad-bg' : ''}`}>
      <div className="text-ink-3 text-code font-mono">{label}</div>
      <div className={`num text-lg font-semibold tracking-tight ${flagged ? 'text-bad-fg' : ''}`}>
        {count}
      </div>
    </div>
  );
}

function Signal({ label, ok }: { label: string; ok: boolean }) {
  const Icon = ok ? Check : X;
  return (
    <li className="flex items-center gap-2.5 border-b py-2 text-sm">
      <span
        className={`flex size-4.5 items-center justify-center rounded-md ${ok ? 'bg-ok-bg text-ok-fg' : 'bg-bad-bg text-bad-fg'}`}
      >
        <Icon className="size-3" strokeWidth={3} />
      </span>
      {label}
      <span className="sr-only">{ok ? 'present' : 'missing'}</span>
    </li>
  );
}

function CountSignal({ label, count, total }: { label: string; count: number; total: number }) {
  const ratio = total > 0 ? count / total : 0;
  const tone = ratio >= 0.9 ? 'ok' : ratio >= 0.5 ? 'warn' : 'bad';
  return (
    <DataRow label={label}>
      <span className="text-label font-mono">
        <span className={`font-medium ${toneColour(tone)}`}>{pct(count, total)}%</span>{' '}
        <span className="text-ink-3">
          {count}/{total}
        </span>
      </span>
    </DataRow>
  );
}

function RawStat({ label, value }: { label: string; value: number }) {
  return (
    <DataRow label={label}>
      <span className="text-ink-2 text-label font-mono">{value.toLocaleString()}</span>
    </DataRow>
  );
}

function Placement({ label, ok }: { label: string; ok: boolean }) {
  const Icon = ok ? Check : X;
  return (
    <Badge variant={ok ? 'ok' : 'bad'}>
      <Icon className="size-3" strokeWidth={3} />
      {label}
      <span className="sr-only">{ok ? 'yes' : 'no'}</span>
    </Badge>
  );
}

const SEVERITY_TONE: Record<Issue['severity'], Tone | 'neutral'> = {
  error: 'bad',
  warning: 'warn',
  info: 'neutral',
};
