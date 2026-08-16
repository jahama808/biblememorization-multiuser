import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isBanned, listAllUsers, requireAdmin, sendError, serviceClient } from '../_lib/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');

  try {
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

    const activeBook = new Map<string, { book_name: string; translation_name: string; id?: string }>();
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
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Server error');
  }
}
