import { useEffect } from 'react';

import { useNavigate } from 'react-router-dom';

import { AuthForm } from '../components/AuthForm';
import { TopNav } from '../components/TopNav';
import { GridRow } from '../components/ui/GridRow';
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
    <div className="flex flex-1 flex-col">
      <TopNav showAuth={false} />
      <div className="frame flex-1">
        <section className="grid grid-cols-1 lg:grid-cols-12">
          <div className="cell px-5 pb-10 pt-12 sm:px-8 lg:col-span-8 lg:border-r lg:py-20">
            <h1 className="text-[40px] font-semibold leading-none tracking-display sm:text-[56px]">
              Save your crawls.
            </h1>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink-2">
              You can crawl sites without an account. Logging in saves each crawl to your history so
              you can find the report again later.
            </p>
          </div>
          <div className="cell border-t px-5 pb-12 pt-10 sm:px-8 lg:col-span-4 lg:border-t-0 lg:py-20">
            <AuthForm onDone={() => navigate('/')} />
          </div>
        </section>
        <GridRow inner={['lg:left-[66.666%]']}>
          <div />
        </GridRow>
      </div>
    </div>
  );
}
