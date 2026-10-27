import { Suspense, lazy } from 'react';

import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

const AccountMenu = lazy(() => import('./AccountMenu'));

export function AuthBar() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // button-sized so the nav doesn't jump when auth resolves
  const placeholder = <span className="inline-block h-9 w-17" aria-hidden="true" />;
  if (loading) {
    return placeholder;
  }

  if (!user) {
    return (
      <Button variant="secondary" onClick={() => navigate('/auth')} className="px-3.5">
        Log in
      </Button>
    );
  }

  return (
    <Suspense fallback={placeholder}>
      <AccountMenu user={user} />
    </Suspense>
  );
}
