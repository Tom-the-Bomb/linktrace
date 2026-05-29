import { useEffect } from 'react';

import { Link2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm';
import { useAuth } from '../context/AuthContext';

// Full-page sign-in route at /auth. After success → /. If the user is already logged
// in (e.g. they navigated here by typing the URL), redirect away.
export default function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="relative flex flex-1 flex-col">
      {/* wordmark in the top-left, mirroring the Hero header so the auth route doesn't feel
          stranded from the rest of the app */}
      <header className="px-6 py-4 sm:px-10">
        <Link to="/" className="inline-flex items-center gap-2" aria-label="Go to home">
          <Link2 className="h-4 w-4 text-accent" strokeWidth={2.25} />
          <span className="display text-xl font-medium tracking-tight">linktrace</span>
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <span className="eyebrow">welcome back</span>
            <h1 className="display mt-3 text-3xl font-medium leading-tight sm:text-4xl">
              Sign in or create an account
            </h1>
            <p className="mt-3 font-mono text-xs text-ink-300">
              Logged in crawls are saved to your history.
            </p>
          </div>

          <div className="border border-ink-500/70 bg-ink-700/40 p-6 sm:p-8">
            <AuthForm onDone={() => navigate('/')} />
          </div>

          <button onClick={() => navigate('/')} className="btn-ghost mt-6">
            ← back
          </button>
        </div>
      </div>
    </div>
  );
}
