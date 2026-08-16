import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ADMIN_PASSWORD_CHANGED_KEY, validateNewAdminPassword } from '../../src/lib/admin-access';
import {
  anonClient,
  bootstrapPassword,
  configuredAdminEmail,
  readJsonBody,
  requireAdmin,
  sendError,
  serviceClient,
  sessionCookies,
  setCookies,
} from '../_lib/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
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
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Server error');
  }
}
