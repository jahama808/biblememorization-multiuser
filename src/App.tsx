import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminApp } from './admin/AdminApp';
import { Layout } from './components/Layout';
import { useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { BookSetupPage } from './pages/BookSetupPage';
import { HomePage } from './pages/HomePage';
import { PracticePage } from './pages/PracticePage';
import { StatsPage } from './pages/StatsPage';

function LearnerApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-stone-500">
        Opening Scripture Memory…
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/book-setup" element={<BookSetupPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<LearnerApp />} />
    </Routes>
  );
}
