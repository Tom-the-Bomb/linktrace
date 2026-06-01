import { type ReactNode, useEffect, useState } from 'react';

import * as api from '../api';
import { AuthContext, type AuthState } from './AuthContext';

// On mount, restores session from cookie via getMe; null means anonymous
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value: AuthState = {
    user,
    loading,
    login: async (username, password) => {
      setUser(await api.login(username, password));
    },
    register: async (username, password) => {
      setUser(await api.register(username, password));
    },
    logout: async () => {
      await api.logout();
      setUser(null);
    },
    deleteAccount: async () => {
      await api.deleteAccount();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
