import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeEmail } from '../../src/lib/admin-access';
import { findUserByEmail, readJsonBody, requireAdmin, sendError, serviceClient } from '../_lib/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
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
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Server error');
  }
}
