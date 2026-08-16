export type AdminSession = {
  email: string;
  mustChangePassword: boolean;
};

export type AdminUserRow = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  book_name: string | null;
  translation_name: string | null;
  chunks_learned: number;
  chunks_total: number;
};

export type AdminStats = {
  users: number;
  active_books: number;
  chunks: number;
  translations: Array<{ name: string; count: number }>;
  phases: { DAILY: number; WEEKLY: number; QUARTERLY: number; queued: number };
  recent_completions: Array<{
    email: string;
    completed_date: string;
    phase: string;
    created_at: string;
  }>;
  per_user: Array<{
    email: string;
    book_name: string | null;
    translation_name: string | null;
    chunks_learned: number;
    chunks_total: number;
  }>;
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; mustChangePassword?: boolean };
  if (!response.ok) {
    throw Object.assign(new Error(body.error || `Request failed (${response.status})`), {
      status: response.status,
      mustChangePassword: body.mustChangePassword,
    });
  }
  return body;
}

export const adminApi = {
  session: () => adminFetch<AdminSession>('/api/admin/session'),
  login: (email: string, password: string) =>
    adminFetch<AdminSession>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  changePassword: (newPassword: string) =>
    adminFetch<{ ok: boolean; mustChangePassword: boolean; email: string }>('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
  logout: () => adminFetch<{ ok: boolean }>('/api/admin/logout', { method: 'POST' }),
  users: () => adminFetch<{ users: AdminUserRow[] }>('/api/admin/users'),
  invite: (email: string) =>
    adminFetch<{ ok: boolean; user: { id: string; email: string | null; created_at: string } }>('/api/admin/invite', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  revoke: (userId: string, restore = false) =>
    adminFetch<{ ok: boolean; banned: boolean }>('/api/admin/revoke', {
      method: 'POST',
      body: JSON.stringify({ userId, restore }),
    }),
  stats: () => adminFetch<AdminStats>('/api/admin/stats'),
};
