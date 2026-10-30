import { type ComponentType, type ReactNode } from 'react';

import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { Footer } from './components/Footer';
import { Protected } from './components/Protected';
import { SplitPage } from './components/SplitPage';
import { Button } from './components/ui/button';
import { fetchTick } from './hooks/useJobReport';
import HomePage from './pages/HomePage';

// trims edge crosshairs; clip, not hidden, keeps sticky working
function Shell({ children = <Outlet /> }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      {children}
      <Footer />
    </div>
  );
}

// router lazy, not React.lazy: no Suspense fallback or its 300ms reveal throttle on a direct visit
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

const router = createBrowserRouter([
  {
    Component: Shell,
    // no footer: one appearing later doesn't shift layout, one pushed down does
    HydrateFallback: () => <div className="frame min-h-dvh" />,
    ErrorBoundary: () => (
      <Shell>
        <SplitPage title="Something went wrong">
          <p className="lead mt-4 max-w-md">Reload the page to try again.</p>
          <Button size="lg" className="mt-8" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </SplitPage>
      </Shell>
    ),
    children: [
      { index: true, Component: HomePage },
      { path: 'auth', lazy: page(() => import('./pages/AuthPage')) },
      {
        Component: Protected,
        children: [{ path: 'history', lazy: page(() => import('./pages/HistoryPage')) }],
      },
      {
        path: 'jobs/:jobId',
        // first poll runs while the page chunk downloads
        loader: ({ params }) => {
          const first = fetchTick(params.jobId!, true);
          first.catch(() => {}); // no unhandled rejection if the page never reads it
          return { first };
        },
        lazy: page(() => import('./pages/JobReportPage')),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

// a deploy removes old hashed chunks: reload the target page, at most once a minute to avoid a loop
window.addEventListener('vite:preloadError', () => {
  if (Date.now() - Number(sessionStorage.getItem('reloadedAt')) > 60_000) {
    sessionStorage.setItem('reloadedAt', String(Date.now()));
    const to = router.state.navigation.location;
    window.location.assign(to ? to.pathname + to.search : window.location.href);
  }
});

export default function App() {
  return <RouterProvider router={router} />;
}
