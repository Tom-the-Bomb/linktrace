import { type FormEvent, useState } from 'react';

import { User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { CompactHeader } from '../components/CompactHeader';
import { History } from '../components/History';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useSeo } from '../hooks/useSeo';

// /history route. Protected by <Protected> at the route level so this component
// can assume the user is logged in.
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
      <main className="mx-auto w-full max-w-7xl px-6 pb-24 pt-10 sm:px-10">
        {/* quiet identity line — fills a sliver of space above the section header
            without competing with it visually */}
        {user && (
          <div className="mb-8 flex items-center gap-2 font-mono text-[11px] text-ink-300">
            <User className="h-3 w-3" strokeWidth={2} />
            <span>logged in as</span>
            <span className="text-paper/80">{user.username}</span>
          </div>
        )}
        <History />
      </main>
    </>
  );
}
