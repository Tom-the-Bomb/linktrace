import { Check, X } from 'lucide-react';

import type { SiteAudit, SiteSEO } from '../api';
import { type Tone, pct, toneColour } from '../lib/colours';
import { SectionHeader } from './SectionHeader';
import { DataRow } from './ui/DataRow';

// domain checks (robots, sitemap, https, www) + site-wide SEO roll-ups
export function SiteAuditPanel({ audit, seo }: { audit: SiteAudit; seo: SiteSEO | null }) {
  return (
    <section>
      <SectionHeader
        title="Site health"
        subtitle="Checks on the domain itself, plus SEO totals across every audited page."
      />

      <div className="panel grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="p-5 sm:p-8">
          <h3 className="text-[15px] font-bold tracking-tight">Domain</h3>
          <ul className="mt-2 divide-y divide-line">
            <Check2 ok={audit.robots_found} label="robots.txt found" />
            <Check2 ok={!audit.robots_disallow_all} label="robots.txt allows crawling" />
            <Check2
              ok={audit.sitemap_found}
              label={
                audit.sitemap_found
                  ? `sitemap.xml found (${audit.sitemap_url_count.toLocaleString()} URLs)`
                  : 'sitemap.xml found'
              }
            />
            <Check2 ok={audit.is_https} label="HTTPS available" />
            <Check2 ok={audit.https_redirect} label="HTTP redirects to HTTPS" />
            <Check2 ok={audit.cert_valid} label="TLS certificate valid" />
            <Check2
              ok={audit.www_canonical === 'www' || audit.www_canonical === 'apex'}
              label={`www canonicalisation: ${audit.www_canonical}`}
            />
            {audit.crawl_delay > 0 && (
              <DataRow label="Crawl-delay">
                <span className="num font-mono text-[13px] text-ink-2">{audit.crawl_delay}s</span>
              </DataRow>
            )}
          </ul>
        </div>

        {seo && seo.pages_audited > 0 && (
          <div className="border-t border-line bg-sunken/50 p-5 sm:p-8 lg:border-l lg:border-t-0">
            <h3 className="text-[15px] font-bold tracking-tight">
              Across <span className="num">{seo.pages_audited.toLocaleString()}</span> audited pages
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-x-8 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 [&>li]:border-line sm:[&>li]:border-b">
              <Stat
                label="Duplicate title groups"
                value={seo.duplicate_title_sets}
                bad={seo.duplicate_title_sets > 0}
              />
              <PctStat
                label="Missing meta description"
                count={seo.missing_meta_desc}
                total={seo.pages_audited}
                badAbove={0.3}
              />
              <PctStat
                label="Have a canonical"
                count={seo.with_canonical}
                total={seo.pages_audited}
                goodAbove={0.7}
              />
              <PctStat
                label="Set to noindex"
                count={seo.noindex_pages}
                total={seo.pages_audited}
                badAbove={0.05}
              />
              <PctStat
                label="Structured data (JSON-LD)"
                count={seo.with_jsonld}
                total={seo.pages_audited}
                goodAbove={0.4}
              />
              <PctStat
                label="Open Graph tags"
                count={seo.with_open_graph}
                total={seo.pages_audited}
                goodAbove={0.6}
              />
              <PctStat
                label="Twitter cards"
                count={seo.with_twitter_cards}
                total={seo.pages_audited}
                goodAbove={0.6}
              />
              <PctStat
                label="Viewport meta"
                count={seo.with_viewport}
                total={seo.pages_audited}
                goodAbove={0.95}
              />
              <Stat label="Multiple h1s" value={seo.multiple_h1} bad={seo.multiple_h1 > 0} />
              <Stat label="Missing h1" value={seo.missing_h1} bad={seo.missing_h1 > 0} />
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Check2({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-md ${ok ? 'bg-ok-bg text-ok-fg' : 'bg-bad-bg text-bad-fg'}`}
      >
        {ok ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : (
          <X className="size-3.5" strokeWidth={3} />
        )}
      </span>
      <span>{label}</span>
      <span className="sr-only">{ok ? 'passed' : 'failed'}</span>
    </li>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <DataRow label={label}>
      <span
        className={`num font-mono text-[13px] font-medium ${bad ? 'text-bad-fg' : 'text-ink-2'}`}
      >
        {value.toLocaleString()}
      </span>
    </DataRow>
  );
}

function PctStat({
  label,
  count,
  total,
  goodAbove,
  badAbove,
}: {
  label: string;
  count: number;
  total: number;
  goodAbove?: number;
  badAbove?: number;
}) {
  const ratio = total > 0 ? count / total : 0;
  let tone: Tone | undefined;
  if (goodAbove !== undefined) {
    tone = ratio >= goodAbove ? 'ok' : 'warn';
  }
  if (badAbove !== undefined) {
    tone = ratio > badAbove ? 'bad' : 'ok';
  }
  return (
    <DataRow label={label}>
      <span className="num font-mono text-[13px]">
        <span className={`font-medium ${toneColour(tone)}`}>{pct(count, total)}%</span>{' '}
        <span className="text-ink-3">
          {count.toLocaleString()}/{total.toLocaleString()}
        </span>
      </span>
    </DataRow>
  );
}
