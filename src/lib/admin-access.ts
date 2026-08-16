export const DEFAULT_ADMIN_EMAIL = 'jay.garces@protonmail.com';
export const ADMIN_PASSWORD_CHANGED_KEY = 'admin_password_changed';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function allowlistedAdminEmail(envEmail?: string): string {
  return normalizeEmail(envEmail || DEFAULT_ADMIN_EMAIL);
}

export function isAllowlistedAdmin(email: string | undefined, allowlistedEmail: string): boolean {
  if (!email) return false;
  return normalizeEmail(email) === normalizeEmail(allowlistedEmail);
}

export function adminPasswordChanged(appMetadata: Record<string, unknown> | undefined): boolean {
  return appMetadata?.[ADMIN_PASSWORD_CHANGED_KEY] === true;
}

export type AdminLoginDecision =
  | { ok: true; mustChangePassword: boolean; kind: 'bootstrap' | 'password' }
  | { ok: false; status: 401 | 403; error: string };

export function decideAdminLogin(input: {
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

export function validateNewAdminPassword(newPassword: string, bootstrapPassword: string): string | null {
  if (newPassword.length < 8) return 'New password must be at least 8 characters';
  if (bootstrapPassword && newPassword === bootstrapPassword) {
    return 'New password cannot be the bootstrap password';
  }
  return null;
}
