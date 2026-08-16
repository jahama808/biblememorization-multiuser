import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorNote, Stat } from '../../components/ui';
import { adminApi, type AdminStats } from '../adminApi';

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .stats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load stats'));
  }, []);

  if (!stats) {
    return (
      <div>
        <h1 className="font-serif text-3xl text-stone-900">Dashboard</h1>
        <p className="mt-3 text-stone-500">{error || 'Loading…'}</p>
        <ErrorNote>{error}</ErrorNote>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl text-stone-900">Dashboard</h1>
      <p className="mt-1 text-sm text-stone-500">Study activity across invited learners.</p>
      <ErrorNote>{error}</ErrorNote>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Users" value={stats.users} />
        <Stat label="Active books" value={stats.active_books} />
        <Stat label="Chunks" value={stats.chunks} />
        <Stat label="Queued" value={stats.phases.queued} />
        <Stat label="Daily" value={stats.phases.DAILY} />
        <Stat label="Weekly" value={stats.phases.WEEKLY} />
        <Stat label="Quarterly" value={stats.phases.QUARTERLY} />
        <Stat label="Translations" value={stats.translations.length} />
      </div>
      <Card className="mt-5">
        <h2 className="font-serif text-xl">Recent practice</h2>
        {stats.recent_completions.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">No completions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            {stats.recent_completions.slice(0, 8).map((row) => (
              <li key={`${row.email}-${row.created_at}`} className="flex justify-between gap-3">
                <span>{row.email}</span>
                <span className="text-stone-500">
                  {row.phase} · {row.completed_date}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/admin/stats" className="mt-4 inline-block text-sm font-semibold text-indigo-700">
          Full stats
        </Link>
      </Card>
    </div>
  );
}
