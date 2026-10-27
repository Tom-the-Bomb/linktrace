import { type ComponentType } from 'react';

import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { Footer } from './components/Footer';
import { Protected } from './components/Protected';
import { fetchTick } from './hooks/useJobReport';
import HomePage from './pages/HomePage';

// overflow-x-clip trims edge crosshairs without creating a scroll container (sticky still works)
function Shell() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <Outlet />
      <Footer />
    </div>
  );
}

// only the landing ships in the main bundle. The router loads a lazy page before rendering it, so a
// direct visit shows no Suspense fallback, and skips the 300ms reveal throttle React puts on one
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

const router = createBrowserRouter([
  {
    Component: Shell,
    // no footer while a page loads: one that appears later doesn't shift, one that gets pushed down does
    HydrateFallback: () => <div className="frame min-h-dvh" />,
    children: [
      { index: true, Component: HomePage },
      { path: 'auth', lazy: page(() => import('./pages/AuthPage')) },
      {
        Component: Protected,
        children: [{ path: 'history', lazy: page(() => import('./pages/HistoryPage')) }],
      },
      {
        path: 'jobs/:jobId',
        // starts the first poll while the page's code is still downloading
        loader: ({ params }) => {
          const first = fetchTick(params.jobId!, true);
          first.catch(() => {}); // the page handles failures; this only quiets one it never reads
          return { first };
        },
        lazy: page(() => import('./pages/JobReportPage')),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

// a deploy replaces the hashed chunks, so an open tab can ask for one that's gone: load the page it
// was heading to fresh, at most once a minute so a chunk that's really missing can't cause a loop
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
