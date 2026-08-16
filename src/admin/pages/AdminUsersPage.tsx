import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, ErrorNote } from '../../components/ui';
import { adminApi, type AdminUserRow } from '../adminApi';

function formatWhen(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const data = await adminApi.users();
    setUsers(data.users);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load users'));
  }, []);

  async function revoke(user: AdminUserRow, restore: boolean) {
    const action = restore ? 'restore access for' : 'revoke access for';
    if (!window.confirm(`${restore ? 'Restore' : 'Revoke'} ${user.email}? This will ${action} this learner.`)) {
      return;
    }
    setBusyId(user.id);
    setError(null);
    try {
      await adminApi.revoke(user.id, restore);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update access');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-stone-900">Users</h1>
          <p className="mt-1 text-sm text-stone-500">Who can request a 6-digit code on the main app.</p>
        </div>
        <Link
          to="/admin/invite"
          className="inline-flex min-h-11 items-center rounded-2xl bg-indigo-700 px-4 text-sm font-semibold text-white"
        >
          Invite
        </Link>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="mt-5 overflow-x-auto rounded-3xl border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Last login</th>
              <th className="px-4 py-3 font-semibold">Book</th>
              <th className="px-4 py-3 font-semibold">Progress</th>
              <th className="px-4 py-3 font-semibold">Access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-stone-100">
                <td className="px-4 py-3 font-medium text-stone-900">{user.email}</td>
                <td className="px-4 py-3 text-stone-600">{formatWhen(user.last_sign_in_at)}</td>
                <td className="px-4 py-3 text-stone-600">
                  {user.book_name ? (
                    <>
                      {user.book_name}
                      <span className="block text-xs text-stone-400">{user.translation_name}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-stone-600">
                  {user.chunks_learned}/{user.chunks_total}
                </td>
                <td className="px-4 py-3">
                  {user.banned ? (
                    <Button
                      variant="secondary"
                      className="min-h-10 text-xs"
                      disabled={busyId === user.id}
                      onClick={() => void revoke(user, true)}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="min-h-10 text-xs"
                      disabled={busyId === user.id}
                      onClick={() => void revoke(user, false)}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 ? <p className="px-4 py-6 text-sm text-stone-500">No users yet.</p> : null}
      </div>
    </div>
  );
}
