import { Navigate, Route, Routes } from 'react-router-dom';

import { Footer } from './components/Footer';
import { Protected } from './components/Protected';
import AuthPage from './pages/AuthPage';
import HistoryPage from './pages/HistoryPage';
import HomePage from './pages/HomePage';
import JobReportPage from './pages/JobReportPage';

// Routing shell. Every page renders inside the flex column so the Footer pins to
// the bottom of the viewport for short pages and below the content for long ones.
//
// Routes:
//   /             home + crawl form
//   /auth         login / register (redirects away if already logged in)
//   /history      protected — past crawls (redirects to /auth if anonymous)
//   /jobs/:jobId  live progress + final report (anonymous-friendly)
//   *             anything else → /
export default function App() {
  return (
    <div className="flex min-h-dvh flex-col">
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
      <Footer />
    </div>
  );
}
