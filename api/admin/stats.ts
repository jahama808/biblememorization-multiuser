import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listAllUsers, requireAdmin, sendError, serviceClient } from '../_lib/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');

  try {
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
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Server error');
  }
}
