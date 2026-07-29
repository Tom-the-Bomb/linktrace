import { type ReactNode } from 'react';

import { Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

// gate route behind login; renders nothing while auth is loading, then children or a redirect to /auth
export function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return null;
  }
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}
