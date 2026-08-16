import { TARGET_CHUNK_MAX, TARGET_CHUNK_MIN, type DraftChunk, type OnboardingPhase, type Verse } from './types';

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function versesToDraft(verses: Verse[], startIndex: number, endIndex: number, onboarding: OnboardingPhase = 'NONE'): DraftChunk {
  const slice = verses.slice(startIndex, endIndex + 1);
  return {
    startIndex,
    endIndex,
    verses: slice,
    wordCount: wordCount(slice.map((verse) => verse.text).join(' ')),
    onboarding,
  };
}

export function autoChunkVerses(verses: Verse[]): DraftChunk[] {
  if (verses.length === 0) return [];

  const drafts: DraftChunk[] = [];
  let start = 0;
  let running = 0;

  for (let i = 0; i < verses.length; i += 1) {
    const count = wordCount(verses[i].text);
    const next = running + count;
    const canClose = running >= TARGET_CHUNK_MIN && next > TARGET_CHUNK_MAX && i > start;

    if (canClose) {
      drafts.push(versesToDraft(verses, start, i - 1));
      start = i;
      running = count;
    } else {
      running = next;
    }
  }

  drafts.push(versesToDraft(verses, start, verses.length - 1));
  return drafts;
}

/** Breaks are verse indexes that start a new chunk (always includes 0). */
export function draftsFromBreaks(verses: Verse[], breakIndexes: number[], onboardings: OnboardingPhase[] = []): DraftChunk[] {
  const starts = [...new Set([0, ...breakIndexes.filter((i) => i > 0 && i < verses.length)])].sort((a, b) => a - b);
  return starts.map((start, index) => {
    const end = (starts[index + 1] ?? verses.length) - 1;
    return versesToDraft(verses, start, end, onboardings[index] ?? 'NONE');
  });
}

export function toggleBreak(breakIndexes: number[], verseIndex: number): number[] {
  if (verseIndex <= 0) return breakIndexes;
  const set = new Set(breakIndexes);
  if (set.has(verseIndex)) set.delete(verseIndex);
  else set.add(verseIndex);
  return [...set].sort((a, b) => a - b);
}

export function chunkWordTone(count: number): 'ok' | 'short' | 'long' {
  if (count < TARGET_CHUNK_MIN) return 'short';
  if (count > TARGET_CHUNK_MAX) return 'long';
  return 'ok';
}

export function draftVerseText(draft: DraftChunk): string {
  return draft.verses.map((verse) => verse.text).join(' ');
}
