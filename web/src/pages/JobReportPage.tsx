import { type FormEvent, useEffect, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import {
  type GraphData,
  type PageRow,
  type Report,
  type Status,
  cancelCheck,
  getGraph,
  getReport,
  getResults,
  getStatus,
} from '../api';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useSeo } from '../hooks/useSeo';
import { isTerminalStatus } from '../lib/status';
import { Categories } from '../components/Categories';
import { CompactHeader } from '../components/CompactHeader';
import { CoverageGapPanel } from '../components/CoverageGapPanel';
import { CrawlStatsPanel } from '../components/CrawlStatsPanel';
import { GraphView } from '../components/GraphView';
import { OverallReport } from '../components/OverallReport';
import { ProgressView } from '../components/ProgressView';
import { ResultsTable } from '../components/ResultsTable';
import { SectionHeader } from '../components/SectionHeader';
import { SeoDrawer } from '../components/SeoDrawer';
import { SiteAuditPanel } from '../components/SiteAuditPanel';
import { type Tab, Tabs } from '../components/Tabs';

// Route at /jobs/:jobId. Owns the live polling effect + all the report sections.
// When the user submits a new crawl from this page's header, we create a new job
// and navigate to /jobs/<new-id>, which remounts this component cleanly.
export default function JobReportPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<PageRow[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('graph');
  const [drilldownUrl, setDrilldownUrl] = useState<string | null>(null);

  // "new crawl" input in the compact header; the hook handles create + navigate.
  const [newUrl, setNewUrl] = useState('');
  const { submit, submitting, error: createError } = useCreateCrawl();

  // Per-job pages are transient/anonymous-friendly — title tracks the crawled
  // domain once known, but they stay out of the index.
  useSeo({
    title: status?.url ? `Report · ${status.url}` : 'Crawl report',
    path: `/jobs/${jobId}`,
    noindex: true,
  });

  // Live polling: every tick fetches the full quartet so partial results stream in.
  // setTimeout-recursion (not setInterval) prevents stacked overlapping requests.
  useEffect(() => {
    if (!jobId) return;
    // reset when navigating between jobs (e.g. from /history or a fresh crawl)
    setStatus(null);
    setRows([]);
    setReport(null);
    setGraph(null);
    setError(null);

    let stop = false;
    const tick = async () => {
      try {
        const [s, r, rep, g] = await Promise.all([
          getStatus(jobId),
          getResults(jobId),
          getReport(jobId),
          getGraph(jobId),
        ]);
        if (stop) return;
        setStatus(s);
        setRows(r);
        setReport(rep);
        setGraph(g);
        if (s.status === 'complete' || s.status === 'failed' || s.status === 'stopped') return;
      } catch (err) {
        if (!stop) setError(String(err));
      }
      if (!stop) setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  const isDone = isTerminalStatus(status?.status);

  // Stop while running → POST /cancel + flip local status so the button morphs to Back.
  // Back when done → return to the hero.
  const onStopOrBack = async () => {
    if (!jobId) return;
    if (isDone) {
      navigate('/');
      return;
    }
    try {
      await cancelCheck(jobId);
      setStatus((s) => (s ? { ...s, status: 'stopped' } : s));
    } catch (err) {
      setError(String(err));
    }
  };

  function onNewCrawl(e: FormEvent) {
    e.preventDefault();
    void submit(newUrl);
  }

  if (!jobId) return null;

  return (
    <>
      <CompactHeader
        jobId={jobId}
        url={newUrl}
        setUrl={setNewUrl}
        onSubmit={onNewCrawl}
        submitting={submitting}
        isDone={isDone}
        onStopOrBack={onStopOrBack}
      />

      <main className="mx-auto w-full max-w-7xl px-6 pb-24 pt-10 sm:px-10">
        {(error ?? createError) && (
          <div className="mb-8 border-l-2 border-rose-500 bg-rose-500/5 px-5 py-3 font-mono text-xs text-rose-200">
            {error ?? createError}
          </div>
        )}

        <ProgressView status={status} />

        {report && (
          <div className="mt-16">
            <OverallReport report={report} />
          </div>
        )}

        {report && (report.categories?.length ?? 0) > 0 && (
          <div className="mt-16">
            <Categories categories={report.categories} />
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-16">
            <SectionHeader number="04" title="Explore" subtitle="Browse the crawl" />
            <Tabs
              tab={tab}
              onChange={setTab}
              graphCount={graph?.nodes?.length ?? 0}
              tableCount={rows.length}
            />
            <div className="mt-6">
              {tab === 'graph' && graph && <GraphView data={graph} onSelect={setDrilldownUrl} />}
              {tab === 'table' && <ResultsTable rows={rows} onSelect={setDrilldownUrl} />}
            </div>
          </div>
        )}

        {report?.site_audit && (
          <div className="mt-16">
            <SiteAuditPanel audit={report.site_audit} seo={report.site_seo} />
          </div>
        )}

        {report?.crawl_stats && (
          <div className="mt-16">
            <CrawlStatsPanel stats={report.crawl_stats} />
          </div>
        )}

        {report?.coverage_gap && report.site_audit?.sitemap_found && (
          <div className="mt-16">
            <CoverageGapPanel gap={report.coverage_gap} />
          </div>
        )}
      </main>

      <SeoDrawer jobId={jobId} url={drilldownUrl} onClose={() => setDrilldownUrl(null)} />
    </>
  );
}
