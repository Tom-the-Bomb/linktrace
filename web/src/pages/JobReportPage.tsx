import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import {
  ApiError,
  type GraphData,
  type PageRow,
  type Report,
  type Status,
  cancelCheck,
  deleteJob,
  getGraph,
  getReport,
  getResults,
  getStatus,
} from '../api';
import { Categories } from '../components/Categories';
import { CompactHeader } from '../components/CompactHeader';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { CoverageGapPanel } from '../components/CoverageGapPanel';
import { CrawlStatsPanel } from '../components/CrawlStatsPanel';
import { GraphView } from '../components/GraphView';
import { NotFound } from '../components/NotFound';
import { OverallReport } from '../components/OverallReport';
import { ProgressView } from '../components/ProgressView';
import { ResultsTable } from '../components/ResultsTable';
import { SectionHeader } from '../components/SectionHeader';
import { SeoDrawer } from '../components/SeoDrawer';
import { SiteAuditPanel } from '../components/SiteAuditPanel';
import { type Tab, Tabs } from '../components/Tabs';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { GridRow } from '../components/ui/GridRow';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useSeo } from '../hooks/useSeo';
import { sectionColourMap } from '../lib/colours';
import { errMessage } from '../lib/format';
import { isTerminalStatus } from '../lib/status';

const POLL_MS = 1000;
const HEAVY_EVERY_TICKS = 5; // ~5s between full results/report/graph refreshes
const MAX_POLL_FAILURES = 3; // consecutive errors before giving up on live updates

// Route /jobs/:jobId: live polling plus all report sections.
export default function JobReportPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<PageRow[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('graph');
  const [drilldownUrl, setDrilldownUrl] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [newUrl, setNewUrl] = useState('');
  const { submit, submitting, error: createError } = useCreateCrawl();

  // transient per-job page: title tracks the domain, kept out of the index
  useSeo({
    title: status?.url ? `Report · ${status.url}` : 'Crawl report',
    path: `/jobs/${jobId}`,
    noindex: true,
  });

  // setTimeout recursion (not setInterval) so requests can't overlap
  useEffect(() => {
    if (!jobId) {
      return;
    }
    // reset when switching jobs
    setStatus(null);
    setRows([]);
    setReport(null);
    setGraph(null);
    setError(null);
    setNotFound(false);

    let stop = false;
    let timer: number | undefined;
    let tick = 0;
    let failures = 0;

    const poll = async () => {
      try {
        const s = await getStatus(jobId);
        if (stop) {
          return;
        }
        setStatus(s);
        const done = isTerminalStatus(s.status);

        // results/report/graph are unbounded — a 10k-page crawl ships every row, node and edge.
        // Only /status is cheap enough for every tick; the rest refresh slowly, then once at the end.
        if (done || tick % HEAVY_EVERY_TICKS === 0) {
          const [r, rep, g] = await Promise.all([
            getResults(jobId),
            getReport(jobId),
            getGraph(jobId),
          ]);
          if (stop) {
            return;
          }
          setRows(r);
          setReport(rep);
          setGraph(g);
        }
        failures = 0;
        setError(null);
        if (done) {
          return;
        }
      } catch (err) {
        if (stop) {
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        // one blip shouldn't end live updates for good; only surface a persistent failure
        if (++failures >= MAX_POLL_FAILURES) {
          setError(errMessage(err));
          return;
        }
      }
      tick++;
      if (!stop) {
        timer = window.setTimeout(poll, POLL_MS);
      }
    };

    void poll();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [jobId]);

  const isDone = isTerminalStatus(status?.status);

  // one colour per section, shared by the section list, graph and table
  const categories = report?.categories;
  const colourFor = useMemo(() => sectionColourMap(categories ?? []), [categories]);
  const sections = useMemo(
    () =>
      [...(categories ?? [])].sort((a, b) => b.total_pages - a.total_pages).map((c) => c.category),
    [categories],
  );

  // running: cancel + flip status to Back; done: go to hero
  const onStopOrBack = async () => {
    if (!jobId) {
      return;
    }
    if (isDone) {
      navigate('/');
      return;
    }
    try {
      await cancelCheck(jobId);
      setStatus((s) => (s ? { ...s, status: 'stopped' } : s));
    } catch (err) {
      setError(errMessage(err));
    }
  };

  function onNewCrawl(e: FormEvent) {
    e.preventDefault();
    void submit(newUrl);
  }

  async function onConfirmDelete() {
    if (!jobId) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteJob(jobId);
      navigate('/');
    } catch (err) {
      // server message without the ApiError: prefix
      setDeleteError(errMessage(err));
      setDeleting(false);
    }
  }

  if (!jobId) {
    return null;
  }

  if (notFound) {
    return (
      <NotFound
        title="No report with this ID"
        message="It may have been deleted, or the link is mistyped. Start a new crawl from the home page."
      />
    );
  }

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

      <main className="frame flex-1 pb-16">
        <div>
          {(error ?? createError) && (
            <ErrorBanner className="mx-5 mt-6 sm:mx-8">{error ?? createError}</ErrorBanner>
          )}

          {/* the API refuses these jobs up front; without this the page is just a bare Failed badge */}
          {status?.status === 'failed' && report?.site_audit?.robots_disallow_all && (
            <ErrorBanner className="mx-5 mt-6 sm:mx-8">
              This site&rsquo;s robots.txt disallows crawling, so no pages were checked.
            </ErrorBanner>
          )}

          <ProgressView status={status} onDelete={() => setConfirmingDelete(true)} />
        </div>

        {report && (
          <GridRow>
            <OverallReport report={report} />
          </GridRow>
        )}

        {rows.length > 0 && (
          <GridRow>
            <SectionHeader
              title="All pages"
              subtitle="Click a page to see its full SEO audit."
              right={
                <Tabs
                  tab={tab}
                  onChange={setTab}
                  graphCount={graph?.nodes.length ?? 0}
                  tableCount={rows.length}
                />
              }
            />
            {tab === 'graph' && graph && (
              <GraphView
                data={graph}
                onSelect={setDrilldownUrl}
                colourFor={colourFor}
                sections={sections}
              />
            )}
            {tab === 'table' && (
              <ResultsTable rows={rows} onSelect={setDrilldownUrl} colourFor={colourFor} />
            )}
          </GridRow>
        )}

        {report && report.categories.length > 0 && (
          <GridRow>
            <Categories categories={report.categories} colourFor={colourFor} />
          </GridRow>
        )}

        {report?.site_audit && (
          <GridRow>
            <SiteAuditPanel audit={report.site_audit} seo={report.site_seo} />
          </GridRow>
        )}

        {report?.coverage_gap && report.site_audit?.sitemap_found && (
          <GridRow>
            <CoverageGapPanel gap={report.coverage_gap} />
          </GridRow>
        )}

        {report?.crawl_stats && (
          <GridRow>
            <CrawlStatsPanel stats={report.crawl_stats} />
          </GridRow>
        )}

        {/* close the last cell so it doesn't float on the canvas */}
        {report && (
          <GridRow>
            <div />
          </GridRow>
        )}
      </main>

      <SeoDrawer jobId={jobId} url={drilldownUrl} onClose={() => setDrilldownUrl(null)} />

      {confirmingDelete && status && (
        <ConfirmDeleteDialog
          url={status.url}
          startedAt={status.created_at}
          busy={deleting}
          error={deleteError}
          onConfirm={onConfirmDelete}
          onCancel={() => {
            setConfirmingDelete(false);
            setDeleteError(null);
          }}
        />
      )}
    </>
  );
}
