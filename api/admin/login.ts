import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ADMIN_PASSWORD_CHANGED_KEY, adminPasswordChanged, decideAdminLogin } from '../../src/lib/admin-access';
import {
  anonClient,
  bootstrapPassword,
  configuredAdminEmail,
  ensureAdminAuthUser,
  readJsonBody,
  sendError,
  serviceClient,
  sessionCookies,
  setCookies,
} from '../_lib/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
    const body = readJsonBody(req);
    const email = String(body.email ?? '');
    const password = String(body.password ?? '');
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
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Server error');
  }
}
