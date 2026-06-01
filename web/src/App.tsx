import { Navigate, Route, Routes } from 'react-router-dom';

import { Footer } from './components/Footer';
import { Protected } from './components/Protected';
import AuthPage from './pages/AuthPage';
import HistoryPage from './pages/HistoryPage';
import HomePage from './pages/HomePage';
import JobReportPage from './pages/JobReportPage';

// routing shell; flex column pins the Footer to the bottom on short pages
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
