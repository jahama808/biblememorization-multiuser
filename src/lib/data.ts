import { addDays, dayOfWeek, nextSundayOnOrAfter, todayInTimeZone } from './dates';
import type { PostgrestError } from '@supabase/supabase-js';
import { completedChunkIdsOnDate, nextSessionByChunk, remainingDueItems } from './practice';
import {
  applyGraduations,
  dailyStreak,
  duePracticeItems,
  formatChunkReference,
  nextQueuedChunk,
  phaseCounts,
  planQueuePromotions,
  trackerDraftFromPromotion,
  upcomingGraduations,
} from './schedule';
import { requireSupabase } from './supabase';
import type {
  BookSelection,
  Chunk,
  DailyCompletion,
  MemorizationTracker,
  OnboardingPhase,
  Phase,
  UserProfile,
} from './types';
import { DEFAULT_TIMEZONE } from './types';

/** Days of completion history loaded for streak and “completed today” checks. */
export const COMPLETION_HISTORY_DAYS = 400;

export function completionHistoryStartDate(today: string): string {
  return addDays(today, -COMPLETION_HISTORY_DAYS);
}

export function completionHistoryEndDate(today: string): string {
  return today;
}

export function matchesCompletionHistoryWindow(completedDate: string, today: string): boolean {
  return (
    completedDate >= completionHistoryStartDate(today) && completedDate <= completionHistoryEndDate(today)
  );
}

export type BookState = {
  profile: UserProfile;
  book: BookSelection | null;
  chunks: Chunk[];
  trackers: MemorizationTracker[];
  completions: DailyCompletion[];
  today: string;
};

export async function ensureProfile(userId: string, timezone = DEFAULT_TIMEZONE): Promise<UserProfile> {
  const client = requireSupabase();
  const { data, error } = await client.from('user_profiles').select('id, timezone').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: inserted, error: insertError } = await client
    .from('user_profiles')
    .insert({ id: userId, timezone })
    .select('id, timezone')
    .single();
  if (insertError) throw insertError;
  return inserted;
}

export async function updateTimezone(userId: string, timezone: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('user_profiles').update({ timezone }).eq('id', userId);
  if (error) throw error;
}

export async function loadBookState(userId: string, todayHint?: string): Promise<BookState> {
  const client = requireSupabase();
  const profile = await ensureProfile(userId);
  const today = todayHint ?? todayInTimeZone(profile.timezone || DEFAULT_TIMEZONE);

  const { data: book, error: bookError } = await client
    .from('book_selections')
    .select('id, user_id, book_name, translation_id, translation_name, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (bookError) throw bookError;

  if (!book) {
    return { profile, book: null, chunks: [], trackers: [], completions: [], today };
  }

  const { data: chunks, error: chunkError } = await client
    .from('chunks')
    .select('id, user_id, book_selection_id, start_verse, end_verse, verse_text, display_order, word_count')
    .eq('user_id', userId)
    .eq('book_selection_id', book.id)
    .order('display_order', { ascending: true });
  if (chunkError) throw chunkError;

  const chunkRows = (chunks ?? []) as Chunk[];
  const chunkIds = chunkRows.map((chunk) => chunk.id);

  const { data: trackers, error: trackerError } = await client
    .from('memorization_trackers')
    .select(
      'id, user_id, chunk_id, phase, week_started, phase_start_date, graduated_to_weekly, graduated_to_quarterly, review_day_of_week, quarterly_review_sunday',
    )
    .eq('user_id', userId);
  if (trackerError) throw trackerError;

  const bookTrackers = ((trackers ?? []) as MemorizationTracker[]).filter((tracker) => chunkIds.includes(tracker.chunk_id));

  const { data: completions, error: completionError } = await client
    .from('daily_completions')
    .select('id, user_id, chunk_id, completed_date, phase_at_completion, session_number')
    .eq('user_id', userId)
    .gte('completed_date', completionHistoryStartDate(today))
    .lte('completed_date', completionHistoryEndDate(today))
    .order('completed_date', { ascending: false });
  if (completionError) throw completionError;

  return {
    profile,
    book,
    chunks: chunkRows,
    trackers: bookTrackers,
    completions: (completions ?? []) as DailyCompletion[],
    today,
  };
}

export type NewChunkInput = {
  start_verse: string;
  end_verse: string;
  verse_text: string;
  display_order: number;
  word_count: number;
  onboarding: OnboardingPhase;
};

export async function saveNewBook(input: {
  userId: string;
  bookName: string;
  translationId: string;
  translationName: string;
  chunks: NewChunkInput[];
  today: string;
}): Promise<BookSelection> {
  const client = requireSupabase();

  const { error: deactivateError } = await client
    .from('book_selections')
    .update({ is_active: false })
    .eq('user_id', input.userId)
    .eq('is_active', true);
  if (deactivateError) throw deactivateError;

  const { data: book, error: bookError } = await client
    .from('book_selections')
    .insert({
      user_id: input.userId,
      book_name: input.bookName,
      translation_id: input.translationId,
      translation_name: input.translationName,
      is_active: true,
    })
    .select('id, user_id, book_name, translation_id, translation_name, is_active')
    .single();
  if (bookError) throw bookError;

  const { data: chunkRows, error: chunkError } = await client
    .from('chunks')
    .insert(
      input.chunks.map((chunk) => ({
        user_id: input.userId,
        book_selection_id: book.id,
        start_verse: chunk.start_verse,
        end_verse: chunk.end_verse,
        verse_text: chunk.verse_text,
        display_order: chunk.display_order,
        word_count: chunk.word_count,
      })),
    )
    .select('id, display_order');
  if (chunkError) throw chunkError;

  const idByOrder = new Map((chunkRows ?? []).map((row) => [row.display_order as number, row.id as string]));
  const weeklyDays: number[] = [];
  const quarterlySundays: string[] = [];
  const trackerRows = input.chunks
    .map((chunk) => {
      const chunkId = idByOrder.get(chunk.display_order);
      if (!chunkId || chunk.onboarding === 'NONE') return null;

      if (chunk.onboarding === 'DAILY') {
        return {
          user_id: input.userId,
          chunk_id: chunkId,
          phase: 'DAILY' as Phase,
          week_started: input.today,
          phase_start_date: input.today,
          graduated_to_weekly: false,
          graduated_to_quarterly: false,
          review_day_of_week: null,
          quarterly_review_sunday: null,
        };
      }

      if (chunk.onboarding === 'WEEKLY') {
        const day = weeklyDays.length % 7;
        weeklyDays.push(day);
        return {
          user_id: input.userId,
          chunk_id: chunkId,
          phase: 'WEEKLY' as Phase,
          week_started: addDays(input.today, -49),
          phase_start_date: input.today,
          graduated_to_weekly: true,
          graduated_to_quarterly: false,
          review_day_of_week: day,
          quarterly_review_sunday: null,
        };
      }

      const sunday = nextSundayOnOrAfter(addDays(input.today, 7 + quarterlySundays.length * 7));
      quarterlySundays.push(sunday);
      return {
        user_id: input.userId,
        chunk_id: chunkId,
        phase: 'QUARTERLY' as Phase,
        week_started: addDays(input.today, -49),
        phase_start_date: addDays(input.today, -213),
        graduated_to_weekly: true,
        graduated_to_quarterly: true,
        review_day_of_week: dayOfWeek(input.today),
        quarterly_review_sunday: sunday,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (trackerRows.length) {
    const { error: trackerError } = await client.from('memorization_trackers').insert(trackerRows);
    if (trackerError) throw trackerError;
  }

  return book as BookSelection;
}

/** Existence check: at most one `daily_completions` row per chunk (any date). */
export async function findPracticedChunkIds(userId: string, chunkIds: string[]): Promise<Set<string>> {
  const client = requireSupabase();
  const practiced = new Set<string>();
  for (const chunkId of chunkIds) {
    const { data, error } = await client
      .from('daily_completions')
      .select('chunk_id')
      .eq('user_id', userId)
      .eq('chunk_id', chunkId)
      .limit(1);
    if (error) throw error;
    const found = data?.[0]?.chunk_id;
    if (found) practiced.add(found);
  }
  return practiced;
}

export async function syncSchedule(state: BookState): Promise<BookState> {
  const client = requireSupabase();
  const { next, changed } = applyGraduations(state.trackers, state.today);

  for (const tracker of changed) {
    const { error } = await client
      .from('memorization_trackers')
      .update({
        phase: tracker.phase,
        phase_start_date: tracker.phase_start_date,
        graduated_to_weekly: tracker.graduated_to_weekly,
        graduated_to_quarterly: tracker.graduated_to_quarterly,
        review_day_of_week: tracker.review_day_of_week,
        quarterly_review_sunday: tracker.quarterly_review_sunday,
      })
      .eq('id', tracker.id)
      .eq('user_id', state.profile.id);
    if (error) throw error;
  }

  const dailyTrackers = next.filter((tracker) => tracker.phase === 'DAILY');
  const queued = state.chunks.filter((chunk) => !next.some((tracker) => tracker.chunk_id === chunk.id));
  const startedChunkIds = new Set(state.completions.map((completion) => completion.chunk_id));
  const dueDailyChunkIds = dailyTrackers
    .filter((tracker) => tracker.week_started <= state.today)
    .map((tracker) => tracker.chunk_id);
  const maybeUnstarted = dueDailyChunkIds.filter((chunkId) => !startedChunkIds.has(chunkId));
  if (maybeUnstarted.length > 0) {
    const practiced = await findPracticedChunkIds(state.profile.id, maybeUnstarted);
    for (const chunkId of practiced) {
      startedChunkIds.add(chunkId);
    }
  }
  const promotions = planQueuePromotions({
    queued,
    today: state.today,
    dailyTrackers,
    startedChunkIds,
  });

  const inserted: MemorizationTracker[] = [];
  if (promotions.length) {
    const rows = promotions.map((promotion) => ({
      user_id: state.profile.id,
      ...trackerDraftFromPromotion(promotion.chunk.id, promotion.week_started),
    }));
    const { data, error } = await client
      .from('memorization_trackers')
      .insert(rows)
      .select(
        'id, user_id, chunk_id, phase, week_started, phase_start_date, graduated_to_weekly, graduated_to_quarterly, review_day_of_week, quarterly_review_sunday',
      );
    if (error) throw error;
    inserted.push(...((data ?? []) as MemorizationTracker[]));
  }

  return { ...state, trackers: [...next, ...inserted] };
}

export const PRACTICE_SAVE_FAILED_MESSAGE =
  'Could not save your practice session. Please try again in a moment.';

export function dedupePracticeItems(items: { chunkId: string; phase: Phase }[]): { chunkId: string; phase: Phase }[] {
  const byChunk = new Map<string, Phase>();
  for (const item of items) {
    byChunk.set(item.chunkId, item.phase);
  }
  return [...byChunk.entries()].map(([chunkId, phase]) => ({ chunkId, phase }));
}

export function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === '23505';
}

function logPracticeSaveError(cause: unknown): void {
  console.error('Practice completion save failed', cause);
}

function throwPracticeSaveFailed(cause: unknown): never {
  logPracticeSaveError(cause);
  throw new Error(PRACTICE_SAVE_FAILED_MESSAGE);
}

export function buildPracticeCompletionRows(
  userId: string,
  items: { chunkId: string; phase: Phase }[],
  today: string,
  existing: { chunk_id: string; session_number: number }[],
): {
  user_id: string;
  chunk_id: string;
  completed_date: string;
  phase_at_completion: Phase;
  session_number: number;
}[] {
  const chunkIds = items.map((item) => item.chunkId);
  const sessionByChunk = nextSessionByChunk(existing, chunkIds);
  return items.map((item) => ({
    user_id: userId,
    chunk_id: item.chunkId,
    completed_date: today,
    phase_at_completion: item.phase,
    session_number: sessionByChunk.get(item.chunkId) ?? 1,
  }));
}

async function loadTodaySessions(
  userId: string,
  today: string,
  chunkIds: string[],
): Promise<{ chunk_id: string; session_number: number }[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('daily_completions')
    .select('chunk_id, session_number')
    .eq('user_id', userId)
    .eq('completed_date', today)
    .in('chunk_id', chunkIds);
  if (error) throw error;
  return data ?? [];
}

export async function writePracticeCompletions(
  userId: string,
  items: { chunkId: string; phase: Phase }[],
  today: string,
): Promise<void> {
  const uniqueItems = dedupePracticeItems(items);
  if (uniqueItems.length === 0) return;

  const client = requireSupabase();
  const chunkIds = uniqueItems.map((item) => item.chunkId);

  async function insertBatch(): Promise<PostgrestError | null> {
    const existing = await loadTodaySessions(userId, today, chunkIds);
    const rows = buildPracticeCompletionRows(userId, uniqueItems, today, existing);
    const { error } = await client.from('daily_completions').insert(rows);
    return error;
  }

  try {
    // Extra practice writes session 2, 3, … for the same day. It does not
    // update trackers or due dates — see src/lib/practice.ts.
    let error = await insertBatch();
    if (isUniqueViolation(error)) {
      error = await insertBatch();
    }
    if (error) {
      throwPracticeSaveFailed(error);
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message === PRACTICE_SAVE_FAILED_MESSAGE) {
      throw cause;
    }
    throwPracticeSaveFailed(cause);
  }
}

export function summarizeState(state: BookState) {
  const counts = phaseCounts(state.trackers, state.today);
  const due = duePracticeItems(state.chunks, state.trackers, state.today);
  const upcoming = upcomingGraduations(state.chunks, state.trackers, state.today);
  const nextQueued = nextQueuedChunk(state.chunks, state.trackers);
  const dailyDates = state.completions
    .filter((completion) => completion.phase_at_completion === 'DAILY')
    .map((completion) => completion.completed_date);
  const streak = dailyStreak(dailyDates, state.today);
  const completedToday = completedChunkIdsOnDate(state.completions, state.today);
  const dueRemaining = remainingDueItems(due, completedToday);

  return {
    counts,
    due,
    dueRemaining,
    upcoming,
    nextQueued,
    streak,
    learned: counts.learned,
    total: state.chunks.length,
    completedTodayCount: due.filter((item) => completedToday.has(item.chunk.id)).length,
  };
}

export function chunkLabel(bookName: string, chunk: Chunk): string {
  return formatChunkReference(bookName, chunk.start_verse, chunk.end_verse);
}
