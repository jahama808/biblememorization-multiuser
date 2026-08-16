import { addDays, dayOfWeek, daysBetween, nextMonday, nextSundayOnOrAfter } from './dates';
import {
  DAILY_CAP,
  DAILY_PHASE_DAYS,
  WEEKLY_PHASE_DAYS,
  type Chunk,
  type MemorizationTracker,
  type Phase,
  type PracticeItem,
  type UpcomingGraduation,
} from './types';

export type TrackerDraft = {
  chunk_id: string;
  phase: Phase;
  week_started: string;
  phase_start_date: string | null;
  graduated_to_weekly: boolean;
  graduated_to_quarterly: boolean;
  review_day_of_week: number | null;
  quarterly_review_sunday: string | null;
};

export function isDueToday(tracker: MemorizationTracker, today: string): boolean {
  if (tracker.phase === 'DAILY') {
    return tracker.week_started <= today;
  }
  if (tracker.phase === 'WEEKLY') {
    return tracker.review_day_of_week === dayOfWeek(today);
  }
  if (tracker.phase === 'QUARTERLY') {
    return tracker.quarterly_review_sunday === today;
  }
  return false;
}

export function shouldGraduateDaily(tracker: Pick<MemorizationTracker, 'phase' | 'week_started'>, today: string): boolean {
  return tracker.phase === 'DAILY' && daysBetween(tracker.week_started, today) >= DAILY_PHASE_DAYS;
}

export function shouldGraduateWeekly(
  tracker: Pick<MemorizationTracker, 'phase' | 'phase_start_date'>,
  today: string,
): boolean {
  if (tracker.phase !== 'WEEKLY' || !tracker.phase_start_date) return false;
  return daysBetween(tracker.phase_start_date, today) >= WEEKLY_PHASE_DAYS;
}

export function dailyGraduationDate(weekStarted: string): string {
  return addDays(weekStarted, DAILY_PHASE_DAYS);
}

export function weeklyGraduationDate(phaseStart: string): string {
  return addDays(phaseStart, WEEKLY_PHASE_DAYS);
}

export function pickReviewDayOfWeek(existingWeeklyDays: number[]): number {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const day of existingWeeklyDays) {
    if (day >= 0 && day <= 6) counts[day] += 1;
  }
  let best = 0;
  for (let day = 1; day < 7; day += 1) {
    if (counts[day] < counts[best]) best = day;
  }
  return best;
}

export function pickQuarterlySunday(today: string, existingSundays: string[]): string {
  let candidate = nextSundayOnOrAfter(addDays(today, 7));
  const taken = new Set(existingSundays);
  while (taken.has(candidate)) {
    candidate = addDays(candidate, 7);
  }
  return candidate;
}

export function graduateDailyTracker(
  tracker: MemorizationTracker,
  today: string,
  existingWeeklyDays: number[],
): MemorizationTracker {
  const reviewDay = pickReviewDayOfWeek(existingWeeklyDays);
  return {
    ...tracker,
    phase: 'WEEKLY',
    phase_start_date: today,
    graduated_to_weekly: true,
    review_day_of_week: reviewDay,
  };
}

export function graduateWeeklyTracker(
  tracker: MemorizationTracker,
  today: string,
  existingSundays: string[],
): MemorizationTracker {
  return {
    ...tracker,
    phase: 'QUARTERLY',
    graduated_to_quarterly: true,
    quarterly_review_sunday: pickQuarterlySunday(today, existingSundays),
  };
}

export type QueuePromotion = {
  chunk: Chunk;
  week_started: string;
};

/**
 * Unused chunks wait in the queue.
 * If Daily is empty, promote up to 7 (staggered weekly, start next Monday).
 * If Daily has fewer than 7, promote 1 more (starts today).
 */
export function planQueuePromotions(dailyCount: number, queued: Chunk[], today: string): QueuePromotion[] {
  if (queued.length === 0) return [];

  if (dailyCount === 0) {
    const take = queued.slice(0, DAILY_CAP);
    const start = nextMonday(today);
    return take.map((chunk, index) => ({
      chunk,
      week_started: addDays(start, index * 7),
    }));
  }

  if (dailyCount < DAILY_CAP) {
    return [{ chunk: queued[0], week_started: today }];
  }

  return [];
}

export function trackerDraftFromPromotion(userChunkId: string, weekStarted: string): TrackerDraft {
  return {
    chunk_id: userChunkId,
    phase: 'DAILY',
    week_started: weekStarted,
    phase_start_date: weekStarted,
    graduated_to_weekly: false,
    graduated_to_quarterly: false,
    review_day_of_week: null,
    quarterly_review_sunday: null,
  };
}

export function applyGraduations(
  trackers: MemorizationTracker[],
  today: string,
): { next: MemorizationTracker[]; changed: MemorizationTracker[] } {
  const next = trackers.map((tracker) => ({ ...tracker }));
  const changed: MemorizationTracker[] = [];
  const weeklyDays = next.filter((t) => t.phase === 'WEEKLY' && t.review_day_of_week != null).map((t) => t.review_day_of_week as number);
  const quarterlySundays = next
    .filter((t) => t.phase === 'QUARTERLY' && t.quarterly_review_sunday)
    .map((t) => t.quarterly_review_sunday as string);

  for (const tracker of next) {
    if (shouldGraduateDaily(tracker, today)) {
      const updated = graduateDailyTracker(tracker, today, weeklyDays);
      Object.assign(tracker, updated);
      if (updated.review_day_of_week != null) weeklyDays.push(updated.review_day_of_week);
      changed.push(tracker);
    }
  }

  for (const tracker of next) {
    if (shouldGraduateWeekly(tracker, today)) {
      const updated = graduateWeeklyTracker(tracker, today, quarterlySundays);
      Object.assign(tracker, updated);
      if (updated.quarterly_review_sunday) quarterlySundays.push(updated.quarterly_review_sunday);
      changed.push(tracker);
    }
  }

  return { next, changed };
}

export function duePracticeItems(chunks: Chunk[], trackers: MemorizationTracker[], today: string): PracticeItem[] {
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  return trackers
    .filter((tracker) => isDueToday(tracker, today))
    .map((tracker) => {
      const chunk = byId.get(tracker.chunk_id);
      return chunk ? { chunk, tracker } : null;
    })
    .filter((item): item is PracticeItem => item !== null)
    .sort((a, b) => a.chunk.display_order - b.chunk.display_order);
}

export function phaseCounts(trackers: MemorizationTracker[], today: string) {
  const daily = trackers.filter((t) => t.phase === 'DAILY' && t.week_started <= today).length;
  const dailyPending = trackers.filter((t) => t.phase === 'DAILY' && t.week_started > today).length;
  const weekly = trackers.filter((t) => t.phase === 'WEEKLY').length;
  const quarterly = trackers.filter((t) => t.phase === 'QUARTERLY').length;
  return { daily, dailyPending, weekly, quarterly, learned: daily + dailyPending + weekly + quarterly };
}

export function upcomingGraduations(
  chunks: Chunk[],
  trackers: MemorizationTracker[],
  today: string,
  withinDays = 21,
): UpcomingGraduation[] {
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const upcoming: UpcomingGraduation[] = [];

  for (const tracker of trackers) {
    const chunk = byId.get(tracker.chunk_id);
    if (!chunk) continue;

    if (tracker.phase === 'DAILY') {
      const onDate = dailyGraduationDate(tracker.week_started);
      const daysRemaining = daysBetween(today, onDate);
      if (daysRemaining >= 0 && daysRemaining <= withinDays) {
        upcoming.push({ chunk, tracker, toPhase: 'WEEKLY', onDate, daysRemaining });
      }
    }

    if (tracker.phase === 'WEEKLY' && tracker.phase_start_date) {
      const onDate = weeklyGraduationDate(tracker.phase_start_date);
      const daysRemaining = daysBetween(today, onDate);
      if (daysRemaining >= 0 && daysRemaining <= withinDays) {
        upcoming.push({ chunk, tracker, toPhase: 'QUARTERLY', onDate, daysRemaining });
      }
    }
  }

  return upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining || a.chunk.display_order - b.chunk.display_order);
}

export function nextQueuedChunk(chunks: Chunk[], trackers: MemorizationTracker[]): Chunk | null {
  const tracked = new Set(trackers.map((t) => t.chunk_id));
  return chunks.filter((chunk) => !tracked.has(chunk.id)).sort((a, b) => a.display_order - b.display_order)[0] ?? null;
}

/**
 * Streak from Daily completions. A calendar day counts when at least one
 * DAILY-phase completion exists. Today may be incomplete without breaking
 * a streak that includes yesterday.
 */
export function dailyStreak(dailyCompletionDates: string[], today: string): number {
  const unique = [...new Set(dailyCompletionDates)].sort();
  if (unique.length === 0) return 0;

  const set = new Set(unique);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;

  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function formatChunkReference(bookName: string, startVerse: string, endVerse: string): string {
  if (startVerse === endVerse) return `${bookName} ${startVerse}`;

  const [startChapter, startV] = startVerse.split(':');
  const [endChapter, endV] = endVerse.split(':');
  if (startChapter === endChapter) {
    return `${bookName} ${startChapter}:${startV}–${endV}`;
  }
  return `${bookName} ${startVerse}–${endVerse}`;
}
