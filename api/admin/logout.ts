import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookies, sendError, setCookies } from '../_lib/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');
  setCookies(res, clearSessionCookies());
  return res.status(200).json({ ok: true });
}
