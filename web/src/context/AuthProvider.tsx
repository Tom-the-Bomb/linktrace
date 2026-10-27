import { type ReactNode, useEffect, useMemo, useState } from 'react';

import * as api from '../api';
import { AuthContext, type AuthState } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getMe()
      .then((me) => setUser((cur) => cur ?? me))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
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
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
