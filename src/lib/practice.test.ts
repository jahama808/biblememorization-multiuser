import { describe, expect, it } from 'vitest';
import { summarizeState, type BookState } from './data';
import {
  canPracticeAgain,
  completedChunkIdsOnDate,
  homePracticePath,
  nextSessionByChunk,
  practiceModeFromSearch,
  remainingDueItems,
  selectPracticeQueue,
} from './practice';
import { duePracticeItems, nextQueuedChunk, planQueuePromotions } from './schedule';
import type { BookSelection, Chunk, DailyCompletion, MemorizationTracker, UserProfile } from './types';

function profile(): UserProfile {
  return { id: 'u', timezone: 'Pacific/Honolulu' };
}

function book(): BookSelection {
  return {
    id: 'b',
    user_id: 'u',
    book_name: 'John',
    translation_id: 'csb',
    translation_name: 'CSB',
    is_active: true,
  };
}

function chunk(id: string, order: number): Chunk {
  return {
    id,
    user_id: 'u',
    book_selection_id: 'b',
    start_verse: `${order}:1`,
    end_verse: `${order}:2`,
    verse_text: 'In the beginning was the Word',
    display_order: order,
    word_count: 6,
  };
}

function tracker(
  partial: Partial<MemorizationTracker> & Pick<MemorizationTracker, 'id' | 'chunk_id' | 'phase' | 'week_started'>,
): MemorizationTracker {
  return {
    user_id: 'u',
    phase_start_date: partial.phase_start_date ?? partial.week_started,
    graduated_to_weekly: false,
    graduated_to_quarterly: false,
    review_day_of_week: null,
    quarterly_review_sunday: null,
    ...partial,
  };
}

function completion(chunkId: string, date: string, session = 1): DailyCompletion {
  return {
    id: `${chunkId}-${date}-${session}`,
    user_id: 'u',
    chunk_id: chunkId,
    completed_date: date,
    phase_at_completion: 'DAILY',
    session_number: session,
  };
}

function state(partial: Partial<BookState> & Pick<BookState, 'chunks' | 'trackers' | 'completions' | 'today'>): BookState {
  return {
    profile: profile(),
    book: book(),
    ...partial,
  };
}

describe('practice queues', () => {
  const today = '2026-08-17'; // Monday
  const dueChunk = chunk('due', 1);
  const pendingChunk = chunk('pending', 2);
  const queuedChunk = chunk('queued', 3);
  const dueTracker = tracker({ id: 't-due', chunk_id: 'due', phase: 'DAILY', week_started: '2026-08-17' });
  const pendingTracker = tracker({ id: 't-pending', chunk_id: 'pending', phase: 'DAILY', week_started: '2026-08-24' });

  it('first session is only due cards that are not completed today', () => {
    const loaded = state({
      chunks: [dueChunk, pendingChunk, queuedChunk],
      trackers: [dueTracker, pendingTracker],
      completions: [],
      today,
    });
    const summary = summarizeState(loaded);
    expect(summary.due.map((item) => item.chunk.id)).toEqual(['due']);
    expect(summary.dueRemaining.map((item) => item.chunk.id)).toEqual(['due']);
    expect(selectPracticeQueue(summary, 'due').map((item) => item.chunk.id)).toEqual(['due']);
    expect(homePracticePath(summary)).toBe('/practice');
  });

  it('after the first completion, review still offers the same due card', () => {
    const loaded = state({
      chunks: [dueChunk, pendingChunk, queuedChunk],
      trackers: [dueTracker, pendingTracker],
      completions: [completion('due', today)],
      today,
    });
    const summary = summarizeState(loaded);
    expect(summary.dueRemaining).toEqual([]);
    expect(summary.due.map((item) => item.chunk.id)).toEqual(['due']);
    expect(selectPracticeQueue(summary, 'review').map((item) => item.chunk.id)).toEqual(['due']);
    expect(canPracticeAgain(summary)).toBe(true);
    expect(homePracticePath(summary)).toBe('/practice?review=1');
  });

  it('does not pull pending Monday Daily or unused Queue chunks into either session', () => {
    const loaded = state({
      chunks: [dueChunk, pendingChunk, queuedChunk],
      trackers: [dueTracker, pendingTracker],
      completions: [completion('due', today)],
      today,
    });
    const summary = summarizeState(loaded);
    const dueIds = new Set(duePracticeItems(loaded.chunks, loaded.trackers, today).map((item) => item.chunk.id));
    expect(dueIds.has('pending')).toBe(false);
    expect(dueIds.has('queued')).toBe(false);
    expect(selectPracticeQueue(summary, 'review').map((item) => item.chunk.id)).toEqual(['due']);
    expect(nextQueuedChunk(loaded.chunks, loaded.trackers)?.id).toBe('queued');
  });

  it('leaves empty-Daily Monday batching unchanged after a completion', () => {
    const queued = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => chunk(`c${n}`, n));
    const promotions = planQueuePromotions(0, queued, '2026-08-16');
    expect(promotions).toHaveLength(7);
    expect(promotions[0].week_started).toBe('2026-08-17');
    expect(promotions[1].week_started).toBe('2026-08-24');
  });

  it('increments session_number for extra reps without replacing session 1', () => {
    const existing = [
      { chunk_id: 'due', session_number: 1 },
      { chunk_id: 'due', session_number: 2 },
    ];
    const next = nextSessionByChunk(existing, ['due', 'other']);
    expect(next.get('due')).toBe(3);
    expect(next.get('other')).toBe(1);
  });

  it('reads review mode from the Home / Practice again query string', () => {
    expect(practiceModeFromSearch('')).toBe('due');
    expect(practiceModeFromSearch('?review=1')).toBe('review');
    expect(practiceModeFromSearch('review=1')).toBe('review');
    expect(practiceModeFromSearch('?review=0')).toBe('due');
  });

  it('treats a prior day’s completion as still due today', () => {
    const ids = completedChunkIdsOnDate([completion('due', '2026-08-16')], today);
    const due = duePracticeItems([dueChunk], [dueTracker], today);
    expect(remainingDueItems(due, ids)).toHaveLength(1);
  });
});
