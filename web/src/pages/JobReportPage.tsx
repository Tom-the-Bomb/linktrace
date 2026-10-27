import { useCallback, useMemo, useState } from 'react';

import { ChartNetwork, Table2 } from 'lucide-react';
import { useLoaderData, useLocation, useNavigate, useParams } from 'react-router-dom';

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
import { type Tick, useJobReport } from '../hooks/useJobReport';
import { useSeo } from '../hooks/useSeo';
import { sectionColourMap } from '../lib/colours';
import { errMessage } from '../lib/format';
import { buildTree } from '../lib/graph';
import { isTerminalStatus } from '../lib/status';

export default function JobReportPage() {
  const jobId = useParams().jobId!;
  return <JobReport key={jobId} jobId={jobId} />;
}

function JobReport({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const joined = (useLocation().state as { joined?: boolean } | null)?.joined;

  const { first } = useLoaderData() as { first: Promise<Tick> };
  const { status, setStatus, rows, report, graph, error, setError, notFound } = useJobReport(
    jobId,
    first,
  );
  // separate from drawerOpen so the drawer keeps its content while sliding out
  const [drilldownUrl, setDrilldownUrl] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openAudit = useCallback((url: string) => {
    setDrilldownUrl(url);
    setDrawerOpen(true);
  }, []);

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { submit, submitting, error: createError } = useCreateCrawl();

  useSeo({
    title: status?.url ? `Report for ${status.url}` : 'Crawl report',
    path: `/jobs/${jobId}`,
    noindex: true,
  });

  const isDone = isTerminalStatus(status?.status);

  const categories = report?.categories;
  const sections = useMemo(
    () =>
      [...(categories ?? [])].sort((a, b) => b.total_pages - a.total_pages).map((c) => c.category),
    [categories],
  );
  const colourFor = useMemo(() => sectionColourMap(sections), [sections]);

  const tree = useMemo(() => buildTree(graph?.edges ?? []), [graph]);
  const rowsByUrl = useMemo(() => new Map(rows.map((r) => [r.url, r])), [rows]);

  const canManage = status?.can_manage ?? false;
  const canStop = canManage && !isDone;

  const onStopOrBack = async () => {
    if (!canStop) {
      navigate('/');
      return;
    }
    try {
      const { status } = await cancelCheck(jobId);
      setStatus((s) => (s ? { ...s, status } : s));
    } catch (err) {
      setError(errMessage(err));
    }
  };

  async function onConfirmDelete() {
    await deleteJob(jobId);
    navigate('/');
  }

  if (notFound) {
    return (
      <NotFound
        title="No report with this ID"
        message="It may have been deleted, or the link is mistyped."
      />
    );
  }

  return (
    <>
      <CompactHeader
        onSubmit={submit}
        submitting={submitting}
        canStop={canStop}
        onStopOrBack={onStopOrBack}
      />

      {/* min-h-dvh: the footer starts below the fold rather than being pushed there */}
      <main className="frame min-h-dvh flex-1 pb-16">
        {(error ?? createError) && (
          <ErrorBanner className="mx-5 mt-6 sm:mx-8">{error ?? createError}</ErrorBanner>
        )}

        {status?.status === 'failed' && report?.site_audit?.robots_disallow_all && (
          <ErrorBanner className="mx-5 mt-6 sm:mx-8">
            This site&rsquo;s robots.txt disallows crawling, so no pages were checked.
          </ErrorBanner>
        )}

        {joined && (
          <p className="rounded-control bg-sunken text-ink-2 ring-line mx-5 mt-6 px-4 py-3 text-sm ring-1 ring-inset sm:mx-8">
            This site was already being crawled, so you&rsquo;ve joined that crawl instead of
            starting a new one.
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
                subtitle="Click a page to open its audit."
                right={
                  <TabsList aria-label="Explore view">
                    <TabsTrigger value="graph" count={graph?.nodes.length ?? 0} className="px-3.5">
                      <ChartNetwork className="size-4" />
                      Graph
                    </TabsTrigger>
                    <TabsTrigger value="table" count={rows.length} className="px-3.5">
                      <Table2 className="size-4" />
                      Table
                    </TabsTrigger>
                  </TabsList>
                }
              />
              {/* kept mounted so switching tabs doesn't throw away the layout, zoom and filters */}
              <TabsContent value="graph" forceMount className="data-[state=inactive]:hidden">
                {graph && (
                  <GraphView
                    data={graph}
                    tree={tree}
                    selectedUrl={drawerOpen ? drilldownUrl : null}
                    onSelect={openAudit}
                    colourFor={colourFor}
                    sections={sections}
                  />
                )}
              </TabsContent>
              <TabsContent value="table">
                <ResultsTable
                  rows={rows}
                  onSelect={openAudit}
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
              onSelect={openAudit}
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

        {/* empty row draws the last cell's bottom hairline */}
        {report && <GridRow />}
      </main>

      <SeoDrawer
        jobId={jobId}
        url={drilldownUrl}
        open={drawerOpen}
        row={drilldownUrl ? rowsByUrl.get(drilldownUrl) : undefined}
        tree={tree}
        onNavigate={setDrilldownUrl}
        onClose={() => setDrawerOpen(false)}
      />

      {confirmingDelete && status && (
        <ConfirmDeleteDialog
          url={status.url}
          startedAt={status.created_at}
          onConfirm={onConfirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
