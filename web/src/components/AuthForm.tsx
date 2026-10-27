import { type SubmitEvent, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { errMessage } from '../lib/format';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

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
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: 'login' | 'register') {
    setMode(m);
    setError(null);
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md">
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
            className="text-body h-11 px-3.5"
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
            className="text-body h-11 px-3.5"
          />
          {mode === 'register' && (
            <p id="auth-password-hint" className="text-ink-3 text-label mt-1.5">
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
