import { type ReactNode, useEffect, useState } from 'react';

import * as api from '../api';
import { AuthContext, type AuthState } from './AuthContext';

// AuthProvider wraps the app. On mount it asks the server who we are (restores a session
// from an existing cookie). null is a perfectly valid result — that's just "anonymous".
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
