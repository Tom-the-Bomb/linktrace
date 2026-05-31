import type { SiteAudit, SiteSEO } from '../api';
import { SectionHeader } from './SectionHeader';

// domain checks (robots, sitemap, https, www) + site-wide SEO roll-ups.
// reads site_audit (one-shot) and site_seo (aggregated counts).
export function SiteAuditPanel({ audit, seo }: { audit: SiteAudit; seo: SiteSEO | null }) {
  return (
    <section>
      <SectionHeader number="05" title="Site health" subtitle="Domain-level signals" />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ul className="divide-y divide-ink-500/60 border-y border-ink-500/60">
            <Check ok={audit.robots_found} label="robots.txt found" />
            <Check ok={!audit.robots_disallow_all} label="robots.txt allows crawling" />
            <Check
              ok={audit.sitemap_found}
              label={
                audit.sitemap_found
                  ? `sitemap.xml (${audit.sitemap_url_count} urls)`
                  : 'no sitemap.xml'
              }
            />
            <Check ok={audit.is_https} label="https available" />
            <Check ok={audit.https_redirect} label="http to https redirect" />
            <Check ok={audit.cert_valid} label="tls certificate valid" />
            <Check
              ok={audit.www_canonical === 'www' || audit.www_canonical === 'apex'}
              label={`www canonicalization: ${audit.www_canonical}`}
            />
            {audit.crawl_delay > 0 && (
              <li className="flex items-center justify-between py-2.5 font-mono text-xs">
                <span className="text-paper/80">crawl-delay</span>
                <span className="text-ink-300">{audit.crawl_delay}s</span>
              </li>
            )}
          </ul>
        </div>

        {seo && seo.pages_audited > 0 && (
          <aside className="lg:col-span-7">
            <span className="eyebrow">site-wide seo · {seo.pages_audited} pages</span>
            <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <Stat
                label="duplicate title groups"
                value={seo.duplicate_title_sets}
                bad={seo.duplicate_title_sets > 0}
              />
              <PctStat
                label="missing meta desc"
                count={seo.missing_meta_desc}
                total={seo.pages_audited}
                badAbove={0.3}
              />
              <PctStat
                label="have canonical"
                count={seo.with_canonical}
                total={seo.pages_audited}
                goodAbove={0.7}
              />
              <PctStat
                label="noindex pages"
                count={seo.noindex_pages}
                total={seo.pages_audited}
                badAbove={0.05}
              />
              <PctStat
                label="json-ld coverage"
                count={seo.with_jsonld}
                total={seo.pages_audited}
                goodAbove={0.4}
              />
              <PctStat
                label="open graph"
                count={seo.with_open_graph}
                total={seo.pages_audited}
                goodAbove={0.6}
              />
              <PctStat
                label="twitter cards"
                count={seo.with_twitter_cards}
                total={seo.pages_audited}
                goodAbove={0.6}
              />
              <PctStat
                label="viewport meta"
                count={seo.with_viewport}
                total={seo.pages_audited}
                goodAbove={0.95}
              />
              <Stat label="multiple h1" value={seo.multiple_h1} bad={seo.multiple_h1 > 0} />
              <Stat label="missing h1" value={seo.missing_h1} bad={seo.missing_h1 > 0} />
            </ul>
          </aside>
        )}
      </div>
    </section>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between py-2.5 font-mono text-xs">
      <span className="text-paper/80">{label}</span>
      <span className={ok ? 'text-emerald-300' : 'text-rose-300'}>{ok ? '● ok' : '○ no'}</span>
    </li>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <li className="flex items-baseline justify-between py-1.5 font-mono text-xs">
      <span className="text-paper/80">{label}</span>
      <span className={`tabular-nums ${bad ? 'text-rose-300' : 'text-ink-300'}`}>{value}</span>
    </li>
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
  const pct = Math.round(ratio * 100);
  let colour = 'text-ink-300';
  if (goodAbove !== undefined) colour = ratio >= goodAbove ? 'text-emerald-300' : 'text-amber-300';
  if (badAbove !== undefined) colour = ratio > badAbove ? 'text-rose-300' : 'text-emerald-300';
  return (
    <li className="flex items-baseline justify-between py-1.5 font-mono text-xs">
      <span className="text-paper/80">{label}</span>
      <span className={`tabular-nums ${colour}`}>
        {count}/{total} <span className="text-ink-400">({pct}%)</span>
      </span>
    </li>
  );
}
