import { type FormEvent, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { CompactHeader } from '../components/CompactHeader';
import { History } from '../components/History';
import { GridRow } from '../components/ui/GridRow';
import { useAuth } from '../context/AuthContext';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useSeo } from '../hooks/useSeo';

// /history route; <Protected> at the route level guarantees a logged-in user here
export default function HistoryPage() {
  useSeo({ title: 'Crawl history', path: '/history', noindex: true });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [newUrl, setNewUrl] = useState('');
  const { submit, submitting } = useCreateCrawl();

  function onNewCrawl(e: FormEvent) {
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
        isDone={false}
        onStopOrBack={() => navigate('/')}
      />
      <main className="frame flex-1 pb-24">
        <div className="px-5 pb-6 pt-10 sm:px-8">
          <h1 className="text-[28px] font-semibold tracking-[-0.035em] sm:text-4xl">History</h1>
          {user && (
            <p className="mt-1 text-[15px] text-ink-3">
              Crawls saved to <span className="font-semibold text-ink-2">{user.username}</span>
            </p>
          )}
        </div>
        <History />
        {/* close the last cell so it doesn't float on the canvas */}
        <GridRow>
          <div />
        </GridRow>
      </main>
    </>
  );
}
