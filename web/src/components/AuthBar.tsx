import { Suspense, lazy } from 'react';

import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

// lazy so anonymous visitors don't download it
const AccountMenu = lazy(() => import('./AccountMenu'));

export function AuthBar() {
  const { user, loading } = useAuth();

  // button-sized so the nav doesn't jump when auth resolves
  const placeholder = <span className="inline-block h-9 w-17" aria-hidden="true" />;
  if (loading) {
    return placeholder;
  }

  if (!user) {
    return (
      <Button variant="secondary" className="px-3.5" asChild>
        <Link to="/auth">Log in</Link>
      </Button>
    );
  }

  return (
    <Suspense fallback={placeholder}>
      <AccountMenu user={user} />
    </Suspense>
  );
}
