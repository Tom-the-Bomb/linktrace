import { createContext, useContext } from 'react';

import type * as api from '../api';

export interface AuthState {
  user: api.Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

// useAuth reads the auth state from context. Lives apart from <AuthProvider> so the provider
// file can export only a component (keeps React Fast Refresh happy).
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
