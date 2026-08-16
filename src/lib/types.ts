export type Phase = 'DAILY' | 'WEEKLY' | 'QUARTERLY';

export type OnboardingPhase = Phase | 'NONE';

export type UserProfile = {
  id: string;
  timezone: string;
};

export type BookSelection = {
  id: string;
  user_id: string;
  book_name: string;
  translation_id: string;
  translation_name: string;
  is_active: boolean;
};

export type Chunk = {
  id: string;
  user_id: string;
  book_selection_id: string;
  start_verse: string;
  end_verse: string;
  verse_text: string;
  display_order: number;
  word_count: number;
};

export type MemorizationTracker = {
  id: string;
  user_id: string;
  chunk_id: string;
  phase: Phase;
  week_started: string;
  phase_start_date: string | null;
  graduated_to_weekly: boolean;
  graduated_to_quarterly: boolean;
  review_day_of_week: number | null;
  quarterly_review_sunday: string | null;
};

export type DailyCompletion = {
  id: string;
  user_id: string;
  chunk_id: string;
  completed_date: string;
  phase_at_completion: Phase;
  session_number: number;
};

export type Verse = {
  chapter: number;
  verse: number;
  text: string;
  reference: string;
};

export type BibleVersion = {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  languageId: string;
};

export type DraftChunk = {
  startIndex: number;
  endIndex: number;
  verses: Verse[];
  wordCount: number;
  onboarding: OnboardingPhase;
};

export type PracticeItem = {
  chunk: Chunk;
  tracker: MemorizationTracker;
};

export type UpcomingGraduation = {
  chunk: Chunk;
  tracker: MemorizationTracker;
  toPhase: 'WEEKLY' | 'QUARTERLY';
  onDate: string;
  daysRemaining: number;
};

export const DAILY_PHASE_DAYS = 49;
export const WEEKLY_PHASE_DAYS = 213;
export const DAILY_CAP = 7;
export const TARGET_CHUNK_MIN = 25;
export const TARGET_CHUNK_MAX = 40;
export const DEFAULT_TIMEZONE = 'Pacific/Honolulu';
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
