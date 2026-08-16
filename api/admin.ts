import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Self-contained Vercel function for /api/admin and /api/admin/:route.
 * Do not import from src/ or other api/ files — that graph crashed production
 * with FUNCTION_INVOCATION_FAILED. Keep policy helpers aligned with
 * src/lib/admin-access.ts. api/admin/[route].ts must stay an identical copy
 * so the static /api/admin/:route URLs also load without relative imports.
 */
const DEFAULT_ADMIN_EMAIL = 'jay.garces@protonmail.com';
const ADMIN_PASSWORD_CHANGED_KEY = 'admin_password_changed';
const ACCESS_COOKIE = 'sm_admin_access';
const REFRESH_COOKIE = 'sm_admin_refresh';

type AdminLoginDecision =
  | { ok: true; mustChangePassword: boolean; kind: 'bootstrap' | 'password' }
  | { ok: false; status: 401 | 403; error: string };

type AdminGate =
  | { ok: true; user: User; mustChangePassword: boolean }
  | { ok: false; status: number; error: string; mustChangePassword?: boolean };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function allowlistedAdminEmail(envEmail?: string): string {
  return normalizeEmail(envEmail || DEFAULT_ADMIN_EMAIL);
}

function isAllowlistedAdmin(email: string | undefined, allowlistedEmail: string): boolean {
  if (!email) return false;
  return normalizeEmail(email) === normalizeEmail(allowlistedEmail);
}

function adminPasswordChanged(appMetadata: Record<string, unknown> | undefined): boolean {
  return appMetadata?.[ADMIN_PASSWORD_CHANGED_KEY] === true;
}

function decideAdminLogin(input: {
  email: string;
  password: string;
  allowlistedEmail: string;
  bootstrapPassword: string;
  passwordChanged: boolean;
}): AdminLoginDecision {
  if (!isAllowlistedAdmin(input.email, input.allowlistedEmail)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (!input.bootstrapPassword) {
    return { ok: false, status: 401, error: 'Admin bootstrap password is not configured' };
  }
  if (!input.password) {
    return { ok: false, status: 401, error: 'Invalid email or password' };
  }

  const isBootstrap = input.password === input.bootstrapPassword;
  if (isBootstrap) {
    if (input.passwordChanged) {
      return { ok: false, status: 401, error: 'Bootstrap password is no longer valid' };
    }
    return { ok: true, mustChangePassword: true, kind: 'bootstrap' };
  }

  return { ok: true, mustChangePassword: !input.passwordChanged, kind: 'password' };
}

function validateNewAdminPassword(newPassword: string, bootstrap: string): string | null {
  if (newPassword.length < 8) return 'New password must be at least 8 characters';
  if (bootstrap && newPassword === bootstrap) {
    return 'New password cannot be the bootstrap password';
  }
  return null;
}

function configuredAdminEmail(): string {
  return allowlistedAdminEmail(process.env.ADMIN_EMAIL);
}

function bootstrapPassword(): string {
  return process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
}

function supabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
}

function supabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

function serviceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function serviceClient(): SupabaseClient {
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

function anonClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) {
    throw Object.assign(new Error('Supabase URL and anon key must be set on the server'), { status: 500 });
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseCookies(header: string | undefined): Record<string, string> {
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

function sessionCookies(accessToken: string, refreshToken: string, expiresIn = 3600): string[] {
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${cookieFlags(expiresIn)}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(60 * 60 * 24 * 7)}`,
  ];
}

function clearSessionCookies(): string[] {
  return [
    `${ACCESS_COOKIE}=; ${cookieFlags(0)}`,
    `${REFRESH_COOKIE}=; ${cookieFlags(0)}`,
  ];
}

function setCookies(res: VercelResponse, cookies: string[]) {
  res.setHeader('Set-Cookie', cookies);
}

function readJsonBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string' && req.body) {
    return JSON.parse(req.body) as Record<string, unknown>;
  }
  return {};
}

function sendError(res: VercelResponse, status: number, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ error, ...extra });
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
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

async function listAllUsers(admin: SupabaseClient): Promise<User[]> {
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

async function ensureAdminAuthUser(admin: SupabaseClient): Promise<User> {
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

async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
  options?: { allowUnchangedPassword?: boolean },
): Promise<AdminGate> {
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

function isBanned(user: User): boolean {
  const until = (user as User & { banned_until?: string | null }).banned_until;
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

function adminRoute(req: VercelRequest): string {
  const fromQuery = req.query.route;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery.replace(/^\//, '').split('/')[0] ?? '';
  if (Array.isArray(fromQuery) && fromQuery[0]) return String(fromQuery[0]).replace(/^\//, '').split('/')[0] ?? '';
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  return pathname.match(/\/api\/admin\/([^/]+)/)?.[1] ?? '';
}

async function handleSession(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');
  const gate = await requireAdmin(req, res, { allowUnchangedPassword: true });
  if (!gate.ok) return sendError(res, gate.status, gate.error, { mustChangePassword: gate.mustChangePassword });
  return res.status(200).json({
    email: gate.user.email,
    mustChangePassword: gate.mustChangePassword,
  });
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const body = readJsonBody(req);
  const email = String(body.email ?? '');
  const password = String(body.password ?? '');

  if (!isAllowlistedAdmin(email, configuredAdminEmail())) {
    return sendError(res, 403, 'Forbidden');
  }
  if (!password) {
    return sendError(res, 401, 'Invalid email or password');
  }

  const admin = serviceClient();
  const existing = await ensureAdminAuthUser(admin);
  const passwordChanged = adminPasswordChanged(existing.app_metadata as Record<string, unknown> | undefined);

  const decision = decideAdminLogin({
    email,
    password,
    allowlistedEmail: configuredAdminEmail(),
    bootstrapPassword: bootstrapPassword(),
    passwordChanged,
  });

  if (!decision.ok) {
    return sendError(res, decision.status, decision.error);
  }

  if (decision.kind === 'bootstrap' && !passwordChanged) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: { [ADMIN_PASSWORD_CHANGED_KEY]: false },
    });
    if (updateError) return sendError(res, 500, updateError.message);
  }

  const { data, error } = await anonClient().auth.signInWithPassword({
    email: configuredAdminEmail(),
    password,
  });
  if (error || !data.session || !data.user) {
    return sendError(res, 401, error?.message || 'Invalid email or password');
  }

  if (!data.user.email || data.user.email.toLowerCase() !== configuredAdminEmail()) {
    return sendError(res, 403, 'Forbidden');
  }

  setCookies(res, sessionCookies(data.session.access_token, data.session.refresh_token, data.session.expires_in));
  return res.status(200).json({
    email: data.user.email,
    mustChangePassword: decision.mustChangePassword,
  });
}

async function handleChangePassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const gate = await requireAdmin(req, res, { allowUnchangedPassword: true });
  if (!gate.ok) return sendError(res, gate.status, gate.error, { mustChangePassword: gate.mustChangePassword });

  const body = readJsonBody(req);
  const newPassword = String(body.newPassword ?? body.password ?? '');
  const invalid = validateNewAdminPassword(newPassword, bootstrapPassword());
  if (invalid) return sendError(res, 400, invalid);

  const admin = serviceClient();
  const { error } = await admin.auth.admin.updateUserById(gate.user.id, {
    password: newPassword,
    app_metadata: { [ADMIN_PASSWORD_CHANGED_KEY]: true },
  });
  if (error) return sendError(res, 400, error.message);

  const { data, error: signInError } = await anonClient().auth.signInWithPassword({
    email: configuredAdminEmail(),
    password: newPassword,
  });
  if (signInError || !data.session) {
    return sendError(res, 500, signInError?.message || 'Password updated but sign-in failed');
  }

  setCookies(res, sessionCookies(data.session.access_token, data.session.refresh_token, data.session.expires_in));
  return res.status(200).json({ ok: true, mustChangePassword: false, email: configuredAdminEmail() });
}

function handleLogout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');
  setCookies(res, clearSessionCookies());
  return res.status(200).json({ ok: true });
}

async function handleUsers(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');

  const gate = await requireAdmin(req, res);
  if (!gate.ok) return sendError(res, gate.status, gate.error, { mustChangePassword: gate.mustChangePassword });

  const admin = serviceClient();
  const authUsers = await listAllUsers(admin);

  const [{ data: books, error: bookError }, { data: chunks, error: chunkError }, { data: trackers, error: trackerError }] =
    await Promise.all([
      admin.from('book_selections').select('user_id, book_name, translation_name, is_active'),
      admin.from('chunks').select('id, user_id, book_selection_id'),
      admin.from('memorization_trackers').select('chunk_id, user_id'),
    ]);
  if (bookError) throw bookError;
  if (chunkError) throw chunkError;
  if (trackerError) throw trackerError;

  const activeBook = new Map<string, { book_name: string; translation_name: string }>();
  for (const book of books ?? []) {
    if (book.is_active) {
      activeBook.set(book.user_id, { book_name: book.book_name, translation_name: book.translation_name });
    }
  }

  const chunkCount = new Map<string, number>();
  const learnedCount = new Map<string, number>();
  const trackedChunks = new Set((trackers ?? []).map((row) => row.chunk_id));
  for (const chunk of chunks ?? []) {
    chunkCount.set(chunk.user_id, (chunkCount.get(chunk.user_id) ?? 0) + 1);
    if (trackedChunks.has(chunk.id)) {
      learnedCount.set(chunk.user_id, (learnedCount.get(chunk.user_id) ?? 0) + 1);
    }
  }

  const users = authUsers
    .map((user) => {
      const book = activeBook.get(user.id);
      return {
        id: user.id,
        email: user.email ?? '',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        banned: isBanned(user),
        book_name: book?.book_name ?? null,
        translation_name: book?.translation_name ?? null,
        chunks_learned: learnedCount.get(user.id) ?? 0,
        chunks_total: chunkCount.get(user.id) ?? 0,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return res.status(200).json({ users });
}

async function handleInvite(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const gate = await requireAdmin(req, res);
  if (!gate.ok) return sendError(res, gate.status, gate.error, { mustChangePassword: gate.mustChangePassword });

  const body = readJsonBody(req);
  const email = normalizeEmail(String(body.email ?? ''));
  if (!email || !email.includes('@')) return sendError(res, 400, 'A valid email is required');

  const admin = serviceClient();
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    return sendError(res, 409, 'That email already has an account');
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) {
    return sendError(res, 400, error?.message || 'Could not invite that email');
  }

  return res.status(200).json({
    ok: true,
    user: { id: data.user.id, email: data.user.email, created_at: data.user.created_at },
  });
}

async function handleRevoke(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const gate = await requireAdmin(req, res);
  if (!gate.ok) return sendError(res, gate.status, gate.error, { mustChangePassword: gate.mustChangePassword });

  const body = readJsonBody(req);
  const restore = body.restore === true;
  const admin = serviceClient();

  let userId = String(body.userId ?? '');
  const email = String(body.email ?? '');
  if (!userId && email) {
    const found = await findUserByEmail(admin, email);
    if (!found) return sendError(res, 404, 'User not found');
    userId = found.id;
  }
  if (!userId) return sendError(res, 400, 'userId or email is required');

  const { data: existing, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !existing.user) return sendError(res, 404, getError?.message || 'User not found');

  if (existing.user.email?.toLowerCase() === configuredAdminEmail()) {
    return sendError(res, 400, 'The admin account cannot be revoked');
  }

  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: restore ? 'none' : '876000h',
  });
  if (error || !data.user) return sendError(res, 400, error?.message || 'Could not update access');

  return res.status(200).json({
    ok: true,
    userId: data.user.id,
    email: data.user.email,
    banned: isBanned(data.user),
  });
}

async function handleStats(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');

  const gate = await requireAdmin(req, res);
  if (!gate.ok) return sendError(res, gate.status, gate.error, { mustChangePassword: gate.mustChangePassword });

  const admin = serviceClient();
  const authUsers = await listAllUsers(admin);

  const [
    { data: books, error: bookError },
    { data: chunks, error: chunkError },
    { data: trackers, error: trackerError },
    { data: completions, error: completionError },
  ] = await Promise.all([
    admin.from('book_selections').select('id, user_id, book_name, translation_name, is_active'),
    admin.from('chunks').select('id, user_id, book_selection_id'),
    admin.from('memorization_trackers').select('id, user_id, chunk_id, phase'),
    admin
      .from('daily_completions')
      .select('id, user_id, chunk_id, completed_date, phase_at_completion, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
  ]);
  if (bookError) throw bookError;
  if (chunkError) throw chunkError;
  if (trackerError) throw trackerError;
  if (completionError) throw completionError;

  const emailById = new Map(authUsers.map((user) => [user.id, user.email ?? '']));
  const activeBooks = (books ?? []).filter((book) => book.is_active);
  const translations = new Map<string, number>();
  for (const book of activeBooks) {
    const name = book.translation_name || 'Unknown';
    translations.set(name, (translations.get(name) ?? 0) + 1);
  }

  const trackedChunkIds = new Set((trackers ?? []).map((row) => row.chunk_id));
  const phase = { DAILY: 0, WEEKLY: 0, QUARTERLY: 0, queued: 0 };
  for (const tracker of trackers ?? []) {
    if (tracker.phase === 'DAILY') phase.DAILY += 1;
    else if (tracker.phase === 'WEEKLY') phase.WEEKLY += 1;
    else if (tracker.phase === 'QUARTERLY') phase.QUARTERLY += 1;
  }
  phase.queued = (chunks ?? []).filter((chunk) => !trackedChunkIds.has(chunk.id)).length;

  const bookByUser = new Map(activeBooks.map((book) => [book.user_id, book]));
  const chunkCount = new Map<string, number>();
  const learnedCount = new Map<string, number>();
  for (const chunk of chunks ?? []) {
    chunkCount.set(chunk.user_id, (chunkCount.get(chunk.user_id) ?? 0) + 1);
    if (trackedChunkIds.has(chunk.id)) {
      learnedCount.set(chunk.user_id, (learnedCount.get(chunk.user_id) ?? 0) + 1);
    }
  }

  const perUser = authUsers
    .map((user) => {
      const book = bookByUser.get(user.id);
      return {
        email: user.email ?? '',
        book_name: book?.book_name ?? null,
        translation_name: book?.translation_name ?? null,
        chunks_learned: learnedCount.get(user.id) ?? 0,
        chunks_total: chunkCount.get(user.id) ?? 0,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  const recent = (completions ?? []).map((row) => ({
    email: emailById.get(row.user_id) || row.user_id,
    completed_date: row.completed_date,
    phase: row.phase_at_completion,
    created_at: row.created_at,
  }));

  return res.status(200).json({
    users: authUsers.length,
    active_books: activeBooks.length,
    chunks: (chunks ?? []).length,
    translations: [...translations.entries()].map(([name, count]) => ({ name, count })),
    phases: phase,
    recent_completions: recent,
    per_user: perUser,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const route = adminRoute(req);
    if (route === 'session') return await handleSession(req, res);
    if (route === 'login') return await handleLogin(req, res);
    if (route === 'change-password') return await handleChangePassword(req, res);
    if (route === 'logout') return handleLogout(req, res);
    if (route === 'users') return await handleUsers(req, res);
    if (route === 'invite') return await handleInvite(req, res);
    if (route === 'revoke') return await handleRevoke(req, res);
    if (route === 'stats') return await handleStats(req, res);
    return sendError(res, 404, 'Not found');
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Server error');
  }
}
