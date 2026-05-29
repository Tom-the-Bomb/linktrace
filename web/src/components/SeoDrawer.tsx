import { useEffect, useState } from 'react';

import { type SEODetail, getSEODetail } from '../api';
import { scoreTextColour } from '../lib/colours';

interface Props {
  jobId: string;
  url: string | null;
  onClose: () => void;
}

// Slide-in audit panel. Fetches on URL change; closes on backdrop click or Escape.
export function SeoDrawer({ jobId, url, onClose }: Props) {
  const [detail, setDetail] = useState<SEODetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    getSEODetail(jobId, url)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jobId, url]);

  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-900/70 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-ink-500/70 bg-ink-800 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-ink-500/70 px-6 py-5">
          <div className="min-w-0">
            <div className="eyebrow">page audit</div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block truncate font-mono text-sm text-paper hover:text-accent"
            >
              {url}
            </a>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="border border-ink-500/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:bg-ink-600 hover:text-paper"
          >
            esc
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading && <SkeletonRow />}
          {error && (
            <div className="border-l-2 border-rose-500 bg-rose-500/5 px-4 py-3 font-mono text-xs text-rose-200">
              {error}
            </div>
          )}
          {!loading && !error && !detail && <NoAuditState />}
          {detail && <SeoBody detail={detail} />}
        </div>
      </aside>
    </>
  );
}

function NoAuditState() {
  return (
    <div className="flex flex-col items-start gap-3 border-l-2 border-ink-500/70 bg-ink-700/30 px-5 py-6">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
        no audit available
      </span>
      <p className="text-ink-200 text-sm leading-relaxed">
        This page didn't return a healthy response, so no SEO audit was performed.
      </p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
        check the page status in the table or graph for the failure reason.
      </p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse bg-ink-700" />
      <div className="h-32 animate-pulse bg-ink-700" />
      <div className="h-24 animate-pulse bg-ink-700" />
    </div>
  );
}

function SeoBody({ detail }: { detail: SEODetail }) {
  return (
    <div className="space-y-8">
      <ScoreRow score={detail.score} />

      <Section label="title">
        <p className="display text-lg font-light leading-snug text-paper">
          {detail.title || <em className="italic text-ink-300">missing</em>}
        </p>
        <Meta value={`${detail.title_length} chars`} />
      </Section>

      <Section label="meta description">
        <p className="text-sm leading-relaxed text-paper/90">
          {detail.meta_description || <em className="italic text-ink-300">missing</em>}
        </p>
        <Meta value={`${detail.meta_description_length} chars`} />
      </Section>

      <Section label="headings">
        <div className="grid grid-cols-3 gap-3">
          <HeadingTile label="h1" count={detail.h1_count} flagWhen={(n) => n !== 1} />
          <HeadingTile label="h2" count={detail.h2_count} />
          <HeadingTile label="h3" count={detail.h3_count} />
          <HeadingTile label="h4" count={detail.h4_count} />
          <HeadingTile label="h5" count={detail.h5_count} />
          <HeadingTile label="h6" count={detail.h6_count} />
        </div>
      </Section>

      <Section label="signals">
        <ul className="divide-y divide-ink-500/60 border-y border-ink-500/60">
          <Signal label="canonical" ok={!!detail.canonical} />
          <Signal label="viewport" ok={detail.has_viewport} />
          <Signal label="json-ld" ok={detail.jsonld_count > 0} />
          <Signal
            label="open graph"
            ok={!!detail.og_tags && Object.keys(detail.og_tags).length > 0}
          />
          <Signal
            label="twitter cards"
            ok={!!detail.twitter_tags && Object.keys(detail.twitter_tags).length > 0}
          />
          <Signal label="indexable" ok={!detail.noindex} />
          <Signal label={`html lang${detail.html_lang ? ` · ${detail.html_lang}` : ''}`} ok={!!detail.html_lang} />
        </ul>
      </Section>

      {detail.images_total > 0 && (
        <Section label={`images · ${detail.images_total}`}>
          <ul className="divide-y divide-ink-500/60 border-y border-ink-500/60">
            <CountSignal label="alt text" count={detail.images_with_alt} total={detail.images_total} />
            <CountSignal label="width/height" count={detail.images_with_dims} total={detail.images_total} />
            <CountSignal label="lazy loaded" count={detail.images_lazy_loaded} total={detail.images_total} />
            <CountSignal label="responsive (srcset)" count={detail.images_responsive} total={detail.images_total} />
          </ul>
        </Section>
      )}

      {detail.links_internal + detail.links_external > 0 && (
        <Section label="links">
          <ul className="divide-y divide-ink-500/60 border-y border-ink-500/60">
            <RawStat label="internal" value={detail.links_internal} />
            <RawStat label="external" value={detail.links_external} />
            <RawStat label="nofollow" value={detail.links_nofollow} />
          </ul>
        </Section>
      )}

      {detail.primary_keyword && (
        <Section label="keywords">
          <div className="mb-3 flex items-baseline gap-3">
            <span className="display text-2xl font-light text-accent">
              {detail.primary_keyword}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">
              primary
            </span>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Placement label="title" ok={detail.keyword_in_title} />
            <Placement label="h1" ok={detail.keyword_in_h1} />
            <Placement label="url" ok={detail.keyword_in_url} />
          </div>
          {detail.top_keywords && detail.top_keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {detail.top_keywords.slice(0, 12).map((k) => (
                <span
                  key={k.term}
                  className="chip text-ink-200 border-ink-500/70 bg-ink-700/60 font-mono"
                >
                  {k.term}
                  <span className="text-ink-400">{k.count}</span>
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {detail.issues && detail.issues.length > 0 && (
        <Section label={`issues · ${detail.issues.length}`}>
          <ul className="space-y-2">
            {detail.issues.map((iss) => (
              <li
                key={iss.code}
                className={`flex items-baseline gap-3 border-l-2 px-4 py-2 text-sm ${severityStyle(iss.severity)}`}
              >
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                  {iss.severity}
                </span>
                <span>{iss.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="eyebrow mb-3">{label}</div>
      {children}
    </section>
  );
}

function ScoreRow({ score }: { score: number }) {
  const colour = scoreTextColour(score);
  return (
    <div className="flex items-baseline justify-between border-y border-ink-500/60 py-5">
      <span className="eyebrow">score</span>
      <div className="flex items-baseline gap-2">
        <span className={`display text-6xl font-light tabular-nums ${colour}`}>{score}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-300">/ 100</span>
      </div>
    </div>
  );
}

function Meta({ value }: { value: string }) {
  return (
    <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-ink-300">{value}</div>
  );
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
    <div
      className={`border px-3 py-3 ${
        flagged ? 'border-rose-400/40 bg-rose-500/5' : 'border-ink-500/60 bg-ink-700/40'
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-300">{label}</div>
      <div
        className={`display text-3xl font-light tabular-nums ${
          flagged ? 'text-rose-300' : 'text-paper'
        }`}
      >
        {count}
      </div>
    </div>
  );
}

function Signal({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between py-2.5">
      <span className="font-mono text-xs text-paper/80">{label}</span>
      <span className={`font-mono text-xs ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>
        {ok ? '● present' : '○ missing'}
      </span>
    </li>
  );
}

// CountSignal: "X of Y (NN%)" with colour bucketed by ratio. Used for image hygiene.
function CountSignal({ label, count, total }: { label: string; count: number; total: number }) {
  const ratio = total > 0 ? count / total : 0;
  const pct = Math.round(ratio * 100);
  const colour =
    ratio >= 0.9 ? 'text-emerald-300' : ratio >= 0.5 ? 'text-amber-300' : 'text-rose-300';
  return (
    <li className="flex items-center justify-between py-2.5">
      <span className="font-mono text-xs text-paper/80">{label}</span>
      <span className={`font-mono text-xs tabular-nums ${colour}`}>
        {count}/{total} <span className="text-ink-400">({pct}%)</span>
      </span>
    </li>
  );
}

// RawStat: plain count, no ratio. Used for link breakdowns where there's no "good" target.
function RawStat({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between py-2.5">
      <span className="font-mono text-xs text-paper/80">{label}</span>
      <span className="font-mono text-xs tabular-nums text-ink-200">{value}</span>
    </li>
  );
}

function Placement({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`chip font-mono ${
        ok
          ? 'border-emerald-400/30 bg-emerald-500/5 text-emerald-300'
          : 'border-rose-400/30 bg-rose-500/5 text-rose-300'
      }`}
    >
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}

function severityStyle(sev: string): string {
  switch (sev) {
    case 'error':
      return 'border-rose-400 bg-rose-500/5 text-rose-200';
    case 'warning':
      return 'border-accent bg-accent/5 text-accent-soft';
    default:
      return 'border-ink-400 bg-ink-700/40 text-ink-200';
  }
}
