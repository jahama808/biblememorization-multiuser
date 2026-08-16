import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin, sendError } from '../_lib/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');

  try {
    const gate = await requireAdmin(req, res, { allowUnchangedPassword: true });
    if (!gate.ok) return sendError(res, gate.status, gate.error, { mustChangePassword: gate.mustChangePassword });
    return res.status(200).json({
      email: gate.user.email,
      mustChangePassword: gate.mustChangePassword,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Server error');
  }
}
