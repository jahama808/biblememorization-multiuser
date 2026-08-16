import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ADMIN_PASSWORD_CHANGED_KEY,
  adminPasswordChanged,
  allowlistedAdminEmail,
  isAllowlistedAdmin,
} from '../../src/lib/admin-access';

export const ACCESS_COOKIE = 'sm_admin_access';
export const REFRESH_COOKIE = 'sm_admin_refresh';

export function configuredAdminEmail(): string {
  return allowlistedAdminEmail(process.env.ADMIN_EMAIL);
}

export function bootstrapPassword(): string {
  return process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
}

export function supabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
}

export function supabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

export function serviceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function serviceClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) {
    throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY and Supabase URL must be set on the server'), {
      status: 500,
    });
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) {
    throw Object.assign(new Error('Supabase URL and anon key must be set on the server'), { status: 500 });
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

function cookieFlags(maxAge: number): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function sessionCookies(accessToken: string, refreshToken: string, expiresIn = 3600): string[] {
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(expiresIn)}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(60 * 60 * 24 * 7)}`,
  ];
}

export function clearSessionCookies(): string[] {
  return [
    `${ACCESS_COOKIE}=; ${cookieFlags(0)}`,
    `${REFRESH_COOKIE}=; ${cookieFlags(0)}`,
  ];
}

export function setCookies(res: VercelResponse, cookies: string[]) {
  res.setHeader('Set-Cookie', cookies);
}

export function readJsonBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string' && req.body) {
    return JSON.parse(req.body) as Record<string, unknown>;
  }
  return {};
}

export function sendError(res: VercelResponse, status: number, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ error, ...extra });
}

export async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

export async function listAllUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) return users;
    page += 1;
  }
}

export async function ensureAdminAuthUser(admin: SupabaseClient): Promise<User> {
  const email = configuredAdminEmail();
  const existing = await findUserByEmail(admin, email);
  if (existing) return existing;

  const password = bootstrapPassword();
  if (!password) {
    throw Object.assign(new Error('ADMIN_BOOTSTRAP_PASSWORD is not configured'), { status: 500 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { [ADMIN_PASSWORD_CHANGED_KEY]: false },
  });
  if (error || !data.user) {
    throw Object.assign(new Error(error?.message || 'Could not create the admin user'), { status: 500 });
  }
  return data.user;
}

type AdminGate =
  | { ok: true; user: User; mustChangePassword: boolean }
  | { ok: false; status: number; error: string; mustChangePassword?: boolean };

export async function requireAdmin(req: VercelRequest, res: VercelResponse, options?: { allowUnchangedPassword?: boolean }): Promise<AdminGate> {
  const cookies = parseCookies(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined);
  let access = cookies[ACCESS_COOKIE];
  const refresh = cookies[REFRESH_COOKIE];

  if (!access && !refresh) {
    return { ok: false, status: 401, error: 'Not signed in' };
  }

  const admin = serviceClient();
  const anon = anonClient();

  let user: User | null = null;
  if (access) {
    const { data } = await admin.auth.getUser(access);
    user = data.user;
  }

  if (!user && refresh) {
    const { data, error } = await anon.auth.refreshSession({ refresh_token: refresh });
    if (!error && data.session && data.user) {
      setCookies(res, sessionCookies(data.session.access_token, data.session.refresh_token, data.session.expires_in));
      user = data.user;
    }
  }

  if (!user?.email) {
    return { ok: false, status: 401, error: 'Not signed in' };
  }

  if (!isAllowlistedAdmin(user.email, configuredAdminEmail())) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  const mustChangePassword = !adminPasswordChanged(user.app_metadata as Record<string, unknown> | undefined);
  if (mustChangePassword && !options?.allowUnchangedPassword) {
    return { ok: false, status: 403, error: 'Password change required', mustChangePassword: true };
  }

  return { ok: true, user, mustChangePassword };
}

export function isBanned(user: User): boolean {
  const until = (user as User & { banned_until?: string | null }).banned_until;
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}
