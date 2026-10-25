import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { AuthBar } from './AuthBar';
import { Wordmark } from './Wordmark';
import { Button } from './ui/button';

// slim top bar inside the grid frame, for the landing, auth and 404 routes
export function TopNav({ showAuth = true }: { showAuth?: boolean }) {
  const { user } = useAuth();
  return (
    <header className="border-line relative z-20 border-b">
      <div className="frame flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-2">
          {user && (
            <Button variant="ghost" size="quiet" asChild>
              <Link to="/history">History</Link>
            </Button>
          )}
          {showAuth && <AuthBar />}
        </nav>
      </div>
    </header>
  );
}
