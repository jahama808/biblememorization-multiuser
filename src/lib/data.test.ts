import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import type { BookSelection, Chunk, DailyCompletion, MemorizationTracker, UserProfile } from './types';

const mockFrom = vi.fn();

vi.mock('./supabase', () => ({
  requireSupabase: () => ({ from: mockFrom }),
}));

import {
  COMPLETION_HISTORY_DAYS,
  buildPracticeCompletionRows,
  completionHistoryStartDate,
  dedupePracticeItems,
  isUniqueViolation,
  summarizeState,
  writePracticeCompletions,
  type BookState,
} from './data';

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

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

type QueryResult = { data: unknown; error: PostgrestError | null };

function createQueryChain(result: QueryResult | (() => QueryResult | Promise<QueryResult>)) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'in', 'order', 'insert']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (
    onFulfilled?: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(typeof result === 'function' ? result() : result).then(onFulfilled, onRejected);
  return chain;
}

function uniqueViolation(message = 'duplicate key value violates unique constraint'): PostgrestError {
  return {
    code: '23505',
    message,
    details: '',
    hint: '',
    name: 'PostgrestError',
  } as PostgrestError;
}

describe('completion history window', () => {
  it('loads a fixed day window instead of a row cap', () => {
    expect(completionHistoryStartDate('2026-08-17')).toBe(addDays('2026-08-17', -COMPLETION_HISTORY_DAYS));
  });

  it('keeps a long streak when many same-day practice sessions inflate row counts', () => {
    const today = '2026-08-17';
    const streakDays = 60;
    const chunksPerDay = 7;
    const sessionsPerChunk = 3;
    const completions: DailyCompletion[] = [];

    for (let dayOffset = 0; dayOffset < streakDays; dayOffset += 1) {
      const date = addDays(today, -dayOffset);
      for (let chunkIndex = 0; chunkIndex < chunksPerDay; chunkIndex += 1) {
        for (let session = 1; session <= sessionsPerChunk; session += 1) {
          completions.push(completion(`c${chunkIndex}`, date, session));
        }
      }
    }

    expect(completions).toHaveLength(streakDays * chunksPerDay * sessionsPerChunk);
    expect(completions.length).toBeGreaterThan(400);

    const loaded = state({
      chunks: Array.from({ length: chunksPerDay }, (_, index) => chunk(`c${index}`, index + 1)),
      trackers: Array.from({ length: chunksPerDay }, (_, index) =>
        tracker({ id: `t${index}`, chunk_id: `c${index}`, phase: 'DAILY', week_started: addDays(today, -90) }),
      ),
      completions,
      today,
    });

    expect(summarizeState(loaded).streak).toBe(streakDays);
  });

  it('shows how a row cap would truncate the same history', () => {
    const today = '2026-08-17';
    const streakDays = 60;
    const chunksPerDay = 7;
    const sessionsPerChunk = 3;
    const completions: DailyCompletion[] = [];

    for (let dayOffset = 0; dayOffset < streakDays; dayOffset += 1) {
      const date = addDays(today, -dayOffset);
      for (let chunkIndex = 0; chunkIndex < chunksPerDay; chunkIndex += 1) {
        for (let session = 1; session <= sessionsPerChunk; session += 1) {
          completions.push(completion(`c${chunkIndex}`, date, session));
        }
      }
    }

    const rowCapped = [...completions].sort((a, b) => b.completed_date.localeCompare(a.completed_date)).slice(0, 400);
    const truncated = state({
      chunks: [chunk('c0', 1)],
      trackers: [tracker({ id: 't0', chunk_id: 'c0', phase: 'DAILY', week_started: addDays(today, -90) })],
      completions: rowCapped,
      today,
    });

    expect(summarizeState(truncated).streak).toBeLessThan(streakDays);
  });
});

describe('writePracticeCompletions', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('dedupes duplicate chunk ids before assigning session numbers', () => {
    expect(dedupePracticeItems([
      { chunkId: 'a', phase: 'DAILY' },
      { chunkId: 'a', phase: 'WEEKLY' },
    ])).toEqual([{ chunkId: 'a', phase: 'WEEKLY' }]);

    const rows = buildPracticeCompletionRows(
      'u',
      dedupePracticeItems([
        { chunkId: 'a', phase: 'DAILY' },
        { chunkId: 'a', phase: 'DAILY' },
      ]),
      '2026-08-17',
      [{ chunk_id: 'a', session_number: 1 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.session_number).toBe(2);
  });

  it('retries once after a unique violation and uses refreshed session numbers', async () => {
    let selectCount = 0;
    let insertCount = 0;

    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('daily_completions');
      const chain = createQueryChain({ data: null, error: null });
      chain.select = vi.fn(() => {
        selectCount += 1;
        return createQueryChain({
          data:
            selectCount === 1
              ? [{ chunk_id: 'a', session_number: 1 }]
              : [{ chunk_id: 'a', session_number: 1 }, { chunk_id: 'a', session_number: 2 }],
          error: null,
        });
      });
      chain.insert = vi.fn(() => {
        insertCount += 1;
        return createQueryChain({
          data: null,
          error: insertCount === 1 ? uniqueViolation() : null,
        });
      });
      return chain;
    });

    await expect(
      writePracticeCompletions('u', [{ chunkId: 'a', phase: 'DAILY' }], '2026-08-17'),
    ).resolves.toBeUndefined();
    expect(selectCount).toBe(2);
    expect(insertCount).toBe(2);
  });

  it('returns a friendly message when the retry still hits a unique violation', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('daily_completions');
      const chain = createQueryChain({ data: null, error: null });
      chain.select = vi.fn(() =>
        createQueryChain({
          data: [{ chunk_id: 'a', session_number: 1 }],
          error: null,
        }),
      );
      chain.insert = vi.fn(() => createQueryChain({ data: null, error: uniqueViolation() }));
      return chain;
    });

    await expect(
      writePracticeCompletions('u', [{ chunkId: 'a', phase: 'DAILY' }], '2026-08-17'),
    ).rejects.toThrow('Could not save your practice session');
  });
});

describe('isUniqueViolation', () => {
  it('detects Postgres duplicate-key errors', () => {
    expect(isUniqueViolation(uniqueViolation())).toBe(true);
    expect(isUniqueViolation({ code: '42501', message: 'permission denied', details: '', hint: '', name: 'PostgrestError' } as PostgrestError)).toBe(
      false,
    );
    expect(isUniqueViolation(null)).toBe(false);
  });
});
