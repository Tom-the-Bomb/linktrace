import { useEffect, useRef, useState } from 'react';

import { Check, ExternalLink, X } from 'lucide-react';

import { type SEODetail, getSEODetail } from '../api';
import { pct, scoreTierChip, toneColour } from '../lib/colours';
import { errMessage } from '../lib/format';
import { DataRow } from './ui/DataRow';
import { ErrorBanner } from './ui/ErrorBanner';

interface Props {
  jobId: string;
  url: string | null;
  onClose: () => void;
}

// slide-in audit sheet; fetches on URL change, closes on backdrop click or Esc
export function SeoDrawer({ jobId, url, onClose }: Props) {
  const [detail, setDetail] = useState<SEODetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!url) {
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
  }, [jobId, url]);

  useEffect(() => {
    if (!url) {
      return;
    }
    // move focus into the sheet, give it back on close
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [url, onClose]);

  if (!url) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/30" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Page audit"
        className="fixed inset-y-2 right-2 z-50 flex w-[calc(100%-1rem)] max-w-xl animate-row-in flex-col overflow-hidden rounded-panel bg-panel shadow-lift"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-[-0.02em]">
              Audit of <span className="font-mono text-[16px] font-medium">{pathOf(url)}</span>
            </h2>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 flex items-center gap-1.5 font-mono text-[12px] text-ink-3 hover:text-accent-600"
            >
              <span className="truncate">{url}</span>
              <ExternalLink className="size-3 shrink-0" strokeWidth={2.25} aria-hidden="true" />
            </a>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close audit"
            className="btn-quiet shrink-0 !px-1.5 text-[13px]"
          >
            <span className="kbd !h-5 !text-[10px]" aria-hidden="true">
              esc
            </span>
            <X className="size-4" strokeWidth={2.25} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading && <Skeleton />}
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {!loading && !error && !detail && <NoAuditState />}
          {detail && <SeoBody detail={detail} />}
        </div>
      </aside>
    </>
  );
}

function NoAuditState() {
  return (
    <div>
      <p className="font-semibold">No SEO audit for this page</p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
        This page didn&rsquo;t load as a normal HTML page, so there was nothing to audit. Its status
        in the table or graph shows why it failed.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading audit">
      <div className="h-20 animate-pulse rounded-xl bg-sunken" />
      <div className="h-32 animate-pulse rounded-xl bg-sunken" />
      <div className="h-24 animate-pulse rounded-xl bg-sunken" />
    </div>
  );
}

function SeoBody({ detail }: { detail: SEODetail }) {
  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between border-b border-line pb-6">
        <span>
          <span className="block text-[13px] font-medium text-ink-3">SEO score</span>
          <span className={`chip mt-1.5 ${scoreTierChip(detail.score).chip}`}>
            {scoreTierChip(detail.score).label}
          </span>
        </span>
        <span className="flex items-baseline gap-1">
          <span className="num text-5xl font-semibold tracking-[-0.05em]">{detail.score}</span>
          <span className="text-base font-semibold text-ink-3">/100</span>
        </span>
      </div>

      {detail.issues && detail.issues.length > 0 && (
        <Section label="Issues" count={detail.issues.length}>
          <ul className="divide-y divide-line">
            {detail.issues.map((iss) => (
              <li key={iss.code} className="flex items-start gap-3 py-2.5 text-[15px] leading-snug">
                <span className={`chip mt-px ${severityChip(iss.severity)}`}>{iss.severity}</span>
                <span>{iss.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section label="Title">
        <p className="text-[17px] font-semibold leading-snug">
          {detail.title || <em className="font-normal not-italic text-bad-fg">Missing</em>}
        </p>
        <Meta value={`${detail.title_length} characters`} />
      </Section>

      <Section label="Meta description">
        <p className="text-[15px] leading-relaxed text-ink-2">
          {detail.meta_description || <em className="not-italic text-bad-fg">Missing</em>}
        </p>
        <Meta value={`${detail.meta_description_length} characters`} />
      </Section>

      <Section label="Headings">
        <div className="grid grid-cols-6 divide-x divide-line rounded-control ring-1 ring-inset ring-line">
          <HeadingTile label="h1" count={detail.h1_count} flagWhen={(n) => n !== 1} />
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
          <ul className="divide-y divide-line">
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
          <ul className="divide-y divide-line">
            <RawStat label="Internal" value={detail.links_internal} />
            <RawStat label="External" value={detail.links_external} />
            <RawStat label="nofollow" value={detail.links_nofollow} />
          </ul>
        </Section>
      )}

      {detail.primary_keyword && (
        <Section label="Keywords">
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-[-0.03em]">
              {detail.primary_keyword}
            </span>
            <span className="text-[13px] text-ink-3">primary</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Placement label="in title" ok={detail.keyword_in_title} />
            <Placement label="in h1" ok={detail.keyword_in_h1} />
            <Placement label="in URL" ok={detail.keyword_in_url} />
          </div>
          {detail.top_keywords && detail.top_keywords.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {detail.top_keywords.slice(0, 12).map((k) => (
                <span key={k.term} className="chip chip-neutral">
                  {k.term}
                  <span className="num text-ink-3">{k.count}</span>
                </span>
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
      <h3 className="mb-2 flex items-baseline gap-2 text-[15px] font-bold tracking-tight">
        {label}
        {count !== undefined && (
          <span className="num font-mono text-[12px] font-medium text-ink-3">{count}</span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Meta({ value }: { value: string }) {
  return <p className="mt-1.5 font-mono text-[11px] text-ink-3">{value}</p>;
}

function HeadingTile({
  label,
  count,
  flagWhen,
}: {
  label: string;
  count: number;
  flagWhen?: (n: number) => boolean;
}) {
  const flagged = flagWhen?.(count);
  return (
    <div className={`px-2 py-2 text-center ${flagged ? 'bg-bad-bg' : ''}`}>
      <div className="font-mono text-[11px] text-ink-3">{label}</div>
      <div className={`num text-lg font-bold ${flagged ? 'text-bad-fg' : ''}`}>{count}</div>
    </div>
  );
}

function Signal({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2.5 border-b border-line py-2 text-sm">
      <span
        className={`flex size-[18px] items-center justify-center rounded-md ${ok ? 'bg-ok-bg text-ok-fg' : 'bg-bad-bg text-bad-fg'}`}
      >
        {ok ? (
          <Check className="size-3" strokeWidth={3} />
        ) : (
          <X className="size-3" strokeWidth={3} />
        )}
      </span>
      {label}
      <span className="sr-only">{ok ? 'present' : 'missing'}</span>
    </li>
  );
}

// "NN% X/Y", colour bucketed by ratio
function CountSignal({ label, count, total }: { label: string; count: number; total: number }) {
  const ratio = total > 0 ? count / total : 0;
  const tone = ratio >= 0.9 ? 'ok' : ratio >= 0.5 ? 'warn' : 'bad';
  return (
    <DataRow label={label}>
      <span className="num font-mono text-[13px]">
        <span className={`font-medium ${toneColour(tone)}`}>{pct(count, total)}%</span>{' '}
        <span className="text-ink-3">
          {count}/{total}
        </span>
      </span>
    </DataRow>
  );
}

// plain count, no ratio; for breakdowns with no "good" target
function RawStat({ label, value }: { label: string; value: number }) {
  return (
    <DataRow label={label}>
      <span className="num font-mono text-[13px] text-ink-2">{value.toLocaleString()}</span>
    </DataRow>
  );
}

function Placement({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`chip ${ok ? 'chip-ok' : 'chip-bad'}`}>
      {ok ? (
        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
      ) : (
        <X className="size-3" strokeWidth={3} aria-hidden="true" />
      )}
      {label}
      <span className="sr-only">{ok ? 'yes' : 'no'}</span>
    </span>
  );
}

function severityChip(sev: string): string {
  switch (sev) {
    case 'error':
      return 'chip-bad';
    case 'warning':
      return 'chip-warn';
    default:
      return 'chip-neutral';
  }
}

// path + query for the title; the full URL sits beneath it
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || '/';
  } catch {
    return url;
  }
}
