import type { VercelRequest, VercelResponse } from '@vercel/node';
import { configuredAdminEmail, findUserByEmail, isBanned, readJsonBody, requireAdmin, sendError, serviceClient } from '../_lib/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
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
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Server error');
  }
}
