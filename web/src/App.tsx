import { Suspense, lazy } from 'react';

import { Navigate, Route, Routes } from 'react-router-dom';

import { Footer } from './components/Footer';
import { Protected } from './components/Protected';
import AuthPage from './pages/AuthPage';
import HistoryPage from './pages/HistoryPage';
import HomePage from './pages/HomePage';

// the report page carries the graph library, so it loads only when a report is opened
const JobReportPage = lazy(() => import('./pages/JobReportPage'));

// overflow-x-clip trims edge crosshairs without creating a scroll container (sticky still works)
export default function App() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <Suspense fallback={<div className="flex-1" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/history"
            element={
              <Protected>
                <HistoryPage />
              </Protected>
            }
          />
          <Route path="/jobs/:jobId" element={<JobReportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Footer />
    </div>
  );
}
