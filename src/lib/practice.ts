import type { DailyCompletion, PracticeItem } from './types';

/**
 * Practice session queues
 * -----------------------
 * First session of the calendar day (`due` mode): cards that are due today and
 * have no `daily_completions` row for today. Finishing this writes
 * `session_number` 1 (or the next unused number) and is what Home uses for
 * “cards remaining” / Daily streak. That first write is what clears the Daily
 * queue for the day.
 *
 * Extra practice / review (`review` mode): the same due-today cards, including
 * ones already completed today. Finishing writes another `daily_completions`
 * row with a higher `session_number`. Extra reps must not change
 * `memorization_trackers` (phase, `week_started`, review weekday, quarterly
 * Sunday) and must not promote unused Queue chunks.
 *
 * Cards that are not due today stay out of both queues: unused Queue chunks,
 * Daily chunks whose `week_started` is still in the future (Monday batching),
 * Weekly cards on the wrong weekday, Quarterly cards on a different Sunday.
 *
 * Home “Review practice” and the session-complete “Practice again” button both
 * use `review` mode. `/practice?review=1` starts that extra session immediately.
 */
export type PracticeMode = 'due' | 'review';

export type PracticeQueueSource = {
  due: PracticeItem[];
  dueRemaining: PracticeItem[];
};

export function completedChunkIdsOnDate(completions: DailyCompletion[], date: string): Set<string> {
  return new Set(completions.filter((row) => row.completed_date === date).map((row) => row.chunk_id));
}

export function remainingDueItems(due: PracticeItem[], completedChunkIds: Set<string>): PracticeItem[] {
  return due.filter((item) => !completedChunkIds.has(item.chunk.id));
}

export function selectPracticeQueue(source: PracticeQueueSource, mode: PracticeMode): PracticeItem[] {
  return mode === 'review' ? source.due : source.dueRemaining;
}

export function canPracticeAgain(source: PracticeQueueSource): boolean {
  return source.due.length > 0;
}

export function practiceModeFromSearch(search: string): PracticeMode {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('review') === '1' ? 'review' : 'due';
}

/** Home CTA: start leftover due cards, or reopen today's due cards for extra reps. */
export function homePracticePath(source: PracticeQueueSource): string {
  if (source.dueRemaining.length === 0 && source.due.length > 0) return '/practice?review=1';
  return '/practice';
}

/**
 * Next `session_number` per chunk for today's completions.
 * Extra practice increments this; it never overwrites session 1.
 */
export function nextSessionByChunk(
  existing: { chunk_id: string; session_number: number }[],
  chunkIds: string[],
): Map<string, number> {
  const maxSession = new Map<string, number>();
  for (const row of existing) {
    maxSession.set(row.chunk_id, Math.max(maxSession.get(row.chunk_id) ?? 0, row.session_number));
  }
  return new Map(chunkIds.map((chunkId) => [chunkId, (maxSession.get(chunkId) ?? 0) + 1]));
}
