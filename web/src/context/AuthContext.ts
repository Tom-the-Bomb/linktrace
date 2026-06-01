import { createContext, useContext } from 'react';

import type * as api from '../api';

export interface AuthState {
  user: api.Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

// kept apart from <AuthProvider> so that file exports only a component (Fast Refresh)
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
