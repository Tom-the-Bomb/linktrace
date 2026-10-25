import { type SubmitEvent, useMemo, useState } from 'react';

import { ChartNetwork, Table2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { cancelCheck, deleteJob } from '../api';
import { BrokenLinks } from '../components/BrokenLinks';
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
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { GridRow } from '../components/ui/GridRow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useJobReport } from '../hooks/useJobReport';
import { useSeo } from '../hooks/useSeo';
import { sectionColourMap } from '../lib/colours';
import { errMessage } from '../lib/format';
import { buildTree } from '../lib/graph';
import { isTerminalStatus } from '../lib/status';

// Route /jobs/:jobId: live polling plus all report sections.
export default function JobReportPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  // set by useCreateCrawl when the site was already being crawled and we joined that crawl
  const joined = (useLocation().state as { joined?: boolean } | null)?.joined ?? false;

  const { status, setStatus, rows, report, graph, error, setError, notFound } = useJobReport(jobId);
  const [drilldownUrl, setDrilldownUrl] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [newUrl, setNewUrl] = useState('');
  const { submit, submitting, error: createError } = useCreateCrawl();

  // transient per-job page: title tracks the domain, kept out of the index
  useSeo({
    title: status?.url ? `Report for ${status.url}` : 'Crawl report',
    path: `/jobs/${jobId}`,
    noindex: true,
  });

  const isDone = isTerminalStatus(status?.status);

  // one colour per section, shared by the section list, graph and table
  const categories = report?.categories;
  const sections = useMemo(
    () =>
      [...(categories ?? [])].sort((a, b) => b.total_pages - a.total_pages).map((c) => c.category),
    [categories],
  );
  const colourFor = useMemo(() => sectionColourMap(sections), [sections]);

  // where each page was first found, and the click path to it; shared by graph, list and drawer
  const tree = useMemo(() => buildTree(graph), [graph]);
  const rowsByUrl = useMemo(() => new Map(rows.map((r) => [r.url, r])), [rows]);

  // only whoever started the crawl can stop or delete it; everyone else gets Home
  const canManage = status?.can_manage ?? false;
  const canStop = canManage && !isDone;

  // own running crawl: cancel + flip status to Back; otherwise go to hero
  const onStopOrBack = async () => {
    if (!jobId) {
      return;
    }
    if (!canStop) {
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

  function onNewCrawl(e: SubmitEvent) {
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
      setDeleteError(errMessage(err));
    } finally {
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
        url={newUrl}
        setUrl={setNewUrl}
        onSubmit={onNewCrawl}
        submitting={submitting}
        canStop={canStop}
        onStopOrBack={onStopOrBack}
      />

      <main className="frame flex-1 pb-16">
        {(error ?? createError) && (
          <ErrorBanner className="mx-5 mt-6 sm:mx-8">{error ?? createError}</ErrorBanner>
        )}

        {/* the API refuses these jobs up front; without this the page is just a bare Failed badge */}
        {status?.status === 'failed' && report?.site_audit?.robots_disallow_all && (
          <ErrorBanner className="mx-5 mt-6 sm:mx-8">
            This site&rsquo;s robots.txt disallows crawling, so no pages were checked.
          </ErrorBanner>
        )}

        {joined && (
          <p className="rounded-control bg-sunken text-ink-2 ring-line mx-5 mt-6 px-4 py-3 text-sm ring-1 ring-inset sm:mx-8">
            This site was already being crawled, so you&rsquo;ve been taken to that crawl&rsquo;s
            live report instead of starting a second one.
          </p>
        )}

        <ProgressView
          status={status}
          onDelete={canManage ? () => setConfirmingDelete(true) : undefined}
          onRecrawl={() => status && void submit(status.url)}
          recrawling={submitting}
        />

        {report && (
          <GridRow>
            <OverallReport report={report} />
          </GridRow>
        )}

        {rows.length > 0 && (
          <GridRow>
            <Tabs defaultValue="graph">
              <SectionHeader
                title="All pages"
                subtitle="Click a page to see its full SEO audit."
                right={
                  <TabsList aria-label="Explore view">
                    <TabsTrigger value="graph" count={graph?.nodes.length ?? 0} className="px-3.5">
                      <ChartNetwork className="size-4" strokeWidth={2} aria-hidden="true" />
                      Graph
                    </TabsTrigger>
                    <TabsTrigger value="table" count={rows.length} className="px-3.5">
                      <Table2 className="size-4" strokeWidth={2} aria-hidden="true" />
                      Table
                    </TabsTrigger>
                  </TabsList>
                }
              />
              <TabsContent value="graph">
                {graph && (
                  <GraphView
                    data={graph}
                    tree={tree}
                    selectedUrl={drilldownUrl}
                    onSelect={setDrilldownUrl}
                    colourFor={colourFor}
                    sections={sections}
                  />
                )}
              </TabsContent>
              <TabsContent value="table">
                <ResultsTable
                  rows={rows}
                  onSelect={setDrilldownUrl}
                  colourFor={colourFor}
                  siteUrl={status?.url ?? ''}
                  foundOn={tree.parent}
                />
              </TabsContent>
            </Tabs>
          </GridRow>
        )}

        {rows.length > 0 && isDone && (
          <GridRow>
            <BrokenLinks
              rows={rows}
              foundOn={tree.parent}
              siteUrl={status?.url ?? ''}
              onSelect={setDrilldownUrl}
            />
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
        {report && <GridRow />}
      </main>

      <SeoDrawer
        jobId={jobId}
        url={drilldownUrl}
        row={drilldownUrl ? rowsByUrl.get(drilldownUrl) : undefined}
        tree={tree}
        onNavigate={setDrilldownUrl}
        onClose={() => setDrilldownUrl(null)}
      />

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
