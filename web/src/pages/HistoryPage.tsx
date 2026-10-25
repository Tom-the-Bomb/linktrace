import { type SubmitEvent, useState } from 'react';

import { CompactHeader } from '../components/CompactHeader';
import { History } from '../components/History';
import { GridRow } from '../components/ui/GridRow';
import { useAuth } from '../context/AuthContext';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useSeo } from '../hooks/useSeo';

// /history route; <Protected> at the route level guarantees a logged-in user here
export default function HistoryPage() {
  useSeo({ title: 'Crawl history', path: '/history', noindex: true });
  const { user } = useAuth();
  const [newUrl, setNewUrl] = useState('');
  const { submit, submitting } = useCreateCrawl();

  function onNewCrawl(e: SubmitEvent) {
    e.preventDefault();
    void submit(newUrl);
  }

  return (
    <>
      <CompactHeader
        url={newUrl}
        setUrl={setNewUrl}
        onSubmit={onNewCrawl}
        submitting={submitting}
      />
      <main className="frame flex-1 pb-24">
        <div className="px-5 pt-10 pb-6 sm:px-8">
          <h1 className="text-[28px] font-semibold tracking-[-0.035em] sm:text-4xl">History</h1>
          <p className="text-ink-3 mt-1 text-[15px]">
            Crawls saved to <span className="text-ink-2 font-semibold">{user?.username}</span>
          </p>
        </div>
        <History />
        {/* close the last cell so it doesn't float on the canvas */}
        <GridRow />
      </main>
    </>
  );
}
