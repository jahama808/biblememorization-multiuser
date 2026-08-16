import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_EMAIL,
  adminPasswordChanged,
  allowlistedAdminEmail,
  decideAdminLogin,
  isAllowlistedAdmin,
  validateNewAdminPassword,
} from './admin-access';

describe('admin allowlist', () => {
  it('defaults to Jay’s email and rejects everyone else', () => {
    expect(allowlistedAdminEmail(undefined)).toBe(DEFAULT_ADMIN_EMAIL);
    expect(isAllowlistedAdmin('jay.garces@protonmail.com', DEFAULT_ADMIN_EMAIL)).toBe(true);
    expect(isAllowlistedAdmin('Jay.Garces@Protonmail.com', DEFAULT_ADMIN_EMAIL)).toBe(true);
    expect(isAllowlistedAdmin('other@example.com', DEFAULT_ADMIN_EMAIL)).toBe(false);
    expect(isAllowlistedAdmin(undefined, DEFAULT_ADMIN_EMAIL)).toBe(false);
  });
});

describe('decideAdminLogin', () => {
  const base = {
    email: DEFAULT_ADMIN_EMAIL,
    allowlistedEmail: DEFAULT_ADMIN_EMAIL,
    bootstrapPassword: 'Chang3M3',
  };

  it('returns 403 for a non-allowlisted email', () => {
    const result = decideAdminLogin({
      ...base,
      email: 'learner@example.com',
      password: 'Chang3M3',
      passwordChanged: false,
    });
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('accepts the bootstrap password only before it is changed', () => {
    expect(
      decideAdminLogin({ ...base, password: 'Chang3M3', passwordChanged: false }),
    ).toEqual({ ok: true, mustChangePassword: true, kind: 'bootstrap' });

    expect(
      decideAdminLogin({ ...base, password: 'Chang3M3', passwordChanged: true }),
    ).toEqual({ ok: false, status: 401, error: 'Bootstrap password is no longer valid' });
  });

  it('treats a non-bootstrap password as a normal sign-in', () => {
    expect(
      decideAdminLogin({ ...base, password: 'new-secret-1', passwordChanged: true }),
    ).toEqual({ ok: true, mustChangePassword: false, kind: 'password' });
  });
});

describe('password change rules', () => {
  it('rejects short passwords and the bootstrap password', () => {
    expect(validateNewAdminPassword('short', 'Chang3M3')).toMatch(/8 characters/);
    expect(validateNewAdminPassword('Chang3M3', 'Chang3M3')).toMatch(/bootstrap/);
    expect(validateNewAdminPassword('a-real-password', 'Chang3M3')).toBeNull();
  });

  it('reads the changed flag from app_metadata only', () => {
    expect(adminPasswordChanged({ admin_password_changed: true })).toBe(true);
    expect(adminPasswordChanged({ admin_password_changed: false })).toBe(false);
    expect(adminPasswordChanged({})).toBe(false);
  });
});
