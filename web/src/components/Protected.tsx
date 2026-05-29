import { type ReactNode } from 'react';

import { Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

// Gate route content behind a login. Renders nothing while the initial getMe() call
// is in flight, then either the children (logged in) or a redirect to /auth.
export function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
