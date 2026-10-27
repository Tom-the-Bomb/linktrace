import { CompactHeader } from '../components/CompactHeader';
import { History } from '../components/History';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { GridRow } from '../components/ui/GridRow';
import { useAuth } from '../context/AuthContext';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useSeo } from '../hooks/useSeo';

export default function HistoryPage() {
  useSeo({ title: 'Crawl history', path: '/history', noindex: true });
  const { user } = useAuth();
  const { submit, submitting, error } = useCreateCrawl();

  return (
    <>
      <CompactHeader onSubmit={submit} submitting={submitting} />
      <main className="frame flex-1 pb-24">
        {error && <ErrorBanner className="mx-5 mt-6 sm:mx-8">{error}</ErrorBanner>}
        <div className="gutter pt-10 pb-6">
          <h1 className="page-title">History</h1>
          <p className="text-ink-3 text-body mt-1">
            Crawls saved to <span className="text-ink-2 font-semibold">{user?.username}</span>
          </p>
        </div>
        <History />
        {/* empty row draws the last cell's bottom hairline */}
        <GridRow />
      </main>
    </>
  );
}
