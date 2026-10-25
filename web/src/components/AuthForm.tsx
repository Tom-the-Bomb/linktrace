import { type SubmitEvent, useState } from 'react';

import { ApiError } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

// map server responses to a friendly message, overriding per status where clearer
function friendlyError(err: unknown, mode: 'login' | 'register'): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return mode === 'login' ? 'Wrong username or password.' : err.message;
      case 409:
        return 'That username is taken. Try a different one.';
      case 400:
        return err.message;
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
    return "Can't reach the server. Check your connection and try again.";
  }
  return String(err);
}

// login/register form; a segmented toggle switches mode over the same two inputs
export function AuthForm({ onDone }: { onDone?: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(username, password);
      } else {
        await login(username, password);
      }
      onDone?.();
    } catch (err) {
      setError(friendlyError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: 'login' | 'register') {
    setMode(m);
    setError(null);
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && switchMode(v as 'login' | 'register')}
        aria-label="Account"
        className="flex w-full"
      >
        <ToggleGroupItem value="login" className="flex-1">
          Log in
        </ToggleGroupItem>
        <ToggleGroupItem value="register" className="flex-1">
          Create account
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="auth-username" className="mb-1.5 block text-sm font-semibold">
            Username
          </label>
          <Input
            id="auth-username"
            type="text"
            required
            minLength={2}
            maxLength={64}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className="h-11 px-3.5 text-[15px]"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1.5 block text-sm font-semibold">
            Password
          </label>
          <Input
            id="auth-password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            aria-describedby={mode === 'register' ? 'auth-password-hint' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 px-3.5 text-[15px]"
          />
          {mode === 'register' && (
            <p id="auth-password-hint" className="text-ink-3 mt-1.5 text-[13px]">
              At least 8 characters.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-control bg-bad-bg text-bad-fg mt-4 px-3.5 py-2.5 text-sm font-medium"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="xl" disabled={busy} className="mt-6 w-full">
        {busy ? <Spinner aria-label="Working" /> : mode === 'login' ? 'Log in' : 'Create account'}
      </Button>
    </form>
  );
}
