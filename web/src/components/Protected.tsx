import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

export function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return null;
  }
  return user ? <Outlet /> : <Navigate to="/auth" replace />;
}
