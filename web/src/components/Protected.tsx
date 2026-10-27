import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

// layout route gating its children behind login; nothing while auth loads, then the page or /auth
export function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return null;
  }
  return user ? <Outlet /> : <Navigate to="/auth" replace />;
}
