import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, daysBetween, nextMonday, nextSundayOnOrAfter } from './dates';
import { autoChunkVerses, draftsFromBreaks, toggleBreak, wordCount } from './chunks';
import {
  applyGraduations,
  dailyStreak,
  isDueToday,
  nextQueuedChunk,
  phaseCounts,
  planQueuePromotions,
  shouldGraduateDaily,
  shouldGraduateWeekly,
} from './schedule';
import type { Chunk, MemorizationTracker, Verse } from './types';

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

function tracker(partial: Partial<MemorizationTracker> & Pick<MemorizationTracker, 'id' | 'chunk_id' | 'phase' | 'week_started'>): MemorizationTracker {
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

describe('dates', () => {
  it('computes day gaps and weekdays', () => {
    expect(daysBetween('2026-01-01', '2026-02-19')).toBe(49);
    expect(dayOfWeek('2026-08-16')).toBe(0);
    expect(nextMonday('2026-08-16')).toBe('2026-08-17');
    expect(nextMonday('2026-08-17')).toBe('2026-08-17');
    expect(nextSundayOnOrAfter('2026-08-16')).toBe('2026-08-16');
    expect(nextSundayOnOrAfter('2026-08-17')).toBe('2026-08-23');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });
});

describe('graduation', () => {
  it('graduates Daily after 49 days from week_started', () => {
    const t = tracker({ id: '1', chunk_id: 'c1', phase: 'DAILY', week_started: '2026-01-01' });
    expect(shouldGraduateDaily(t, '2026-02-18')).toBe(false);
    expect(shouldGraduateDaily(t, '2026-02-19')).toBe(true);
  });

  it('graduates Weekly after 213 days from phase_start_date', () => {
    const t = tracker({
      id: '1',
      chunk_id: 'c1',
      phase: 'WEEKLY',
      week_started: '2025-01-01',
      phase_start_date: '2026-01-01',
    });
    expect(shouldGraduateWeekly(t, addDays('2026-01-01', 212))).toBe(false);
    expect(shouldGraduateWeekly(t, addDays('2026-01-01', 213))).toBe(true);
  });

  it('applies Daily then Weekly graduations and assigns review days', () => {
    const trackers = [
      tracker({ id: 'd1', chunk_id: 'c1', phase: 'DAILY', week_started: '2026-01-01' }),
      tracker({
        id: 'w1',
        chunk_id: 'c2',
        phase: 'WEEKLY',
        week_started: '2025-01-01',
        phase_start_date: '2025-06-01',
        graduated_to_weekly: true,
        review_day_of_week: 3,
      }),
    ];
    const { changed, next } = applyGraduations(trackers, '2026-02-19');
    expect(changed).toHaveLength(2);
    expect(next.find((t) => t.id === 'd1')?.phase).toBe('WEEKLY');
    expect(next.find((t) => t.id === 'd1')?.graduated_to_weekly).toBe(true);
    expect(next.find((t) => t.id === 'd1')?.review_day_of_week).toBeTypeOf('number');
    expect(next.find((t) => t.id === 'w1')?.phase).toBe('QUARTERLY');
    expect(next.find((t) => t.id === 'w1')?.quarterly_review_sunday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('queue promotion', () => {
  const queued = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => chunk(`c${n}`, n));

  it('promotes up to 7 staggered from next Monday when Daily is empty', () => {
    const promotions = planQueuePromotions(0, queued, '2026-08-16');
    expect(promotions).toHaveLength(7);
    expect(promotions[0].week_started).toBe('2026-08-17');
    expect(promotions[1].week_started).toBe('2026-08-24');
    expect(promotions[6].week_started).toBe('2026-09-28');
  });

  it('promotes one more today when Daily has fewer than 7', () => {
    const promotions = planQueuePromotions(3, queued, '2026-08-16');
    expect(promotions).toHaveLength(1);
    expect(promotions[0].chunk.id).toBe('c1');
    expect(promotions[0].week_started).toBe('2026-08-16');
  });

  it('promotes nothing when Daily is full', () => {
    expect(planQueuePromotions(7, queued, '2026-08-16')).toEqual([]);
  });
});

describe('due / streak / queue peek', () => {
  it('marks Daily due only after week_started', () => {
    const t = tracker({ id: '1', chunk_id: 'c1', phase: 'DAILY', week_started: '2026-08-17' });
    expect(isDueToday(t, '2026-08-16')).toBe(false);
    expect(isDueToday(t, '2026-08-17')).toBe(true);
  });

  it('marks Weekly due on the assigned weekday', () => {
    const t = tracker({
      id: '1',
      chunk_id: 'c1',
      phase: 'WEEKLY',
      week_started: '2026-01-01',
      review_day_of_week: 0,
    });
    expect(isDueToday(t, '2026-08-16')).toBe(true);
    expect(isDueToday(t, '2026-08-17')).toBe(false);
  });

  it('computes a Daily streak that can wait on today', () => {
    expect(dailyStreak(['2026-08-14', '2026-08-15'], '2026-08-16')).toBe(2);
    expect(dailyStreak(['2026-08-14', '2026-08-15', '2026-08-16'], '2026-08-16')).toBe(3);
    expect(dailyStreak(['2026-08-13'], '2026-08-16')).toBe(0);
  });

  it('returns the next unused chunk and phase counts', () => {
    const chunks = [chunk('c1', 1), chunk('c2', 2), chunk('c3', 3)];
    const trackers = [
      tracker({ id: '1', chunk_id: 'c1', phase: 'DAILY', week_started: '2026-08-10' }),
      tracker({ id: '2', chunk_id: 'c2', phase: 'WEEKLY', week_started: '2026-01-01', review_day_of_week: 1 }),
    ];
    expect(nextQueuedChunk(chunks, trackers)?.id).toBe('c3');
    expect(phaseCounts(trackers, '2026-08-16')).toMatchObject({ daily: 1, weekly: 1, quarterly: 0, learned: 2 });
  });
});

describe('chunking', () => {
  const verses: Verse[] = [
    { chapter: 1, verse: 1, text: 'one two three four five six seven eight nine ten', reference: '1:1' },
    { chapter: 1, verse: 2, text: 'eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty', reference: '1:2' },
    { chapter: 1, verse: 3, text: 'twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty', reference: '1:3' },
    { chapter: 1, verse: 4, text: 'a b c d e f g h i j k l m n o', reference: '1:4' },
  ];

  it('counts words and auto-chunks near 25–40', () => {
    expect(wordCount('Hide God\'s Word in your heart')).toBe(6);
    const drafts = autoChunkVerses(verses);
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts[0].wordCount).toBeGreaterThanOrEqual(20);
    expect(drafts.every((draft) => draft.verses.length > 0)).toBe(true);
  });

  it('toggles breaks between verses', () => {
    const breaks = toggleBreak(toggleBreak([], 2), 1);
    const drafts = draftsFromBreaks(verses, breaks);
    expect(drafts).toHaveLength(3);
    expect(drafts[1].startIndex).toBe(1);
  });
});
