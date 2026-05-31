import { type FormEvent, useState } from 'react';

import { ApiError } from '../api';
import { useAuth } from '../context/AuthContext';

// map server responses to a friendly message: forward the backend {error}, override per
// status where clearer (401 differs for login vs register).
function friendlyError(err: unknown, mode: 'login' | 'register'): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return mode === 'login' ? 'Wrong username or password.' : err.message;
      case 409:
        return 'That username is already taken. Pick another.';
      case 400:
        return err.message; // backend's validation message is already the friendliest version
      case 0:
      case 502:
      case 503:
      case 504:
        return "Can't reach the server. Try again in a moment.";
      default:
        return err.message;
    }
  }
  if (err instanceof TypeError) {
    // fetch rejects with TypeError on network failure (no connection, CORS, etc.)
    return "Can't reach the server. Check that the API is running.";
  }
  return String(err);
}

// inner login/register form. toggles mode in place, same two inputs. used by AuthPage.
export function AuthForm({ onDone }: { onDone?: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await register(username, password);
      else await login(username, password);
      onDone?.();
    } catch (err) {
      setError(friendlyError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-4">
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-ink-300">
          username
        </label>
        <input
          type="text"
          required
          minLength={2}
          maxLength={64}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          className="input w-full px-3 py-2.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-ink-300">
          password
        </label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input w-full px-3 py-2.5 text-sm"
        />
      </div>
      {error && (
        <p className="border-l-2 border-rose-500 bg-rose-500/5 px-3 py-2 font-mono text-[11px] text-rose-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full bg-accent px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-ink-900 transition hover:bg-accent-soft disabled:opacity-50"
      >
        {busy ? '…' : mode === 'login' ? 'log in' : 'create account'}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="btn-ghost w-full text-center"
      >
        {mode === 'login' ? 'need an account? register' : 'have one already? log in'}
      </button>
    </form>
  );
}
