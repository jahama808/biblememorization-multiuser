import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { adminApi } from './adminApi';
import { AdminChangePasswordPage } from './pages/AdminChangePasswordPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminInvitePage } from './pages/AdminInvitePage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminStatsPage } from './pages/AdminStatsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';

export function AdminApp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .session()
      .then((session) => {
        setEmail(session.email);
        setMustChangePassword(session.mustChangePassword);
      })
      .catch(() => {
        setEmail(null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-stone-500">Opening admin…</div>;
  }

  if (!email) {
    return (
      <AdminLoginPage
        onSignedIn={(needsChange) => {
          setMustChangePassword(needsChange);
          void adminApi.session().then((session) => setEmail(session.email));
          navigate(needsChange ? '/admin/change-password' : '/admin', { replace: true });
        }}
      />
    );
  }

  if (mustChangePassword) {
    return (
      <Routes>
        <Route
          path="change-password"
          element={
            <AdminChangePasswordPage
              onChanged={() => {
                setMustChangePassword(false);
                navigate('/admin', { replace: true });
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/admin/change-password" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AdminLayout
            email={email}
            onSignOut={() => {
              void adminApi.logout().finally(() => {
                setEmail(null);
                navigate('/admin', { replace: true });
              });
            }}
          />
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="invite" element={<AdminInvitePage />} />
        <Route path="stats" element={<AdminStatsPage />} />
        <Route path="login" element={<Navigate to="/admin" replace />} />
        <Route path="change-password" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
