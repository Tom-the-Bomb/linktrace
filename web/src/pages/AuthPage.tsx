import { useEffect } from 'react';

import { useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm';
import { SplitPage } from '../components/SplitPage';
import { useAuth } from '../context/AuthContext';
import { useSeo } from '../hooks/useSeo';

// Full-page sign-in at /auth; redirects to / on success or if already logged in
export default function AuthPage() {
  useSeo({ title: 'Sign in', path: '/auth', noindex: true });
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <SplitPage
      title="Save your crawls."
      showAuth={false}
      aside={<AuthForm onDone={() => navigate('/')} />}
    >
      <p className="text-ink-2 text-lead mt-4 max-w-md leading-relaxed">
        You can crawl sites without an account. Logging in saves each crawl to your history, so you
        can find its report later.
      </p>
    </SplitPage>
  );
}
