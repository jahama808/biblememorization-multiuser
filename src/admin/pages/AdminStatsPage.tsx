import { useEffect, useState } from 'react';
import { Card, ErrorNote, Stat } from '../../components/ui';
import { adminApi, type AdminStats } from '../adminApi';

export function AdminStatsPage() {
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
        <h1 className="font-serif text-3xl text-stone-900">Stats</h1>
        <p className="mt-3 text-stone-500">{error || 'Loading…'}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl text-stone-900">Stats</h1>
      <ErrorNote>{error}</ErrorNote>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Users" value={stats.users} />
        <Stat label="Active books" value={stats.active_books} />
        <Stat label="Chunks" value={stats.chunks} />
        <Stat label="Queued" value={stats.phases.queued} />
      </div>
      <Card className="mt-5">
        <h2 className="font-serif text-xl">Translations in use</h2>
        {stats.translations.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">None yet.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-stone-700">
            {stats.translations.map((item) => (
              <li key={item.name}>
                {item.name} · {item.count}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-5">
        <h2 className="font-serif text-xl">Per-user progress</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Book</th>
                <th className="py-2">Learned / total</th>
              </tr>
            </thead>
            <tbody>
              {stats.per_user.map((row) => (
                <tr key={row.email} className="border-t border-stone-100">
                  <td className="py-2 pr-4">{row.email}</td>
                  <td className="py-2 pr-4 text-stone-600">
                    {row.book_name ? `${row.book_name} · ${row.translation_name}` : '—'}
                  </td>
                  <td className="py-2">
                    {row.chunks_learned}/{row.chunks_total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="mt-5">
        <h2 className="font-serif text-xl">Recent completions</h2>
        {stats.recent_completions.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">None yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            {stats.recent_completions.map((row) => (
              <li key={`${row.email}-${row.created_at}`}>
                {row.email} · {row.phase} · {row.completed_date}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
