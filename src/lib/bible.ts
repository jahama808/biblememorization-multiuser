import { trackFums } from './fums';
import type { BibleVersion, Verse } from './types';

export async function fetchBibleVersions(): Promise<BibleVersion[]> {
  const response = await fetch('/api/bible?action=bibles');
  const body = (await response.json()) as { bibles?: BibleVersion[]; error?: string };
  if (!response.ok) {
    throw new Error(body.error || 'Could not load Bible translations');
  }
  return body.bibles ?? [];
}

export async function fetchBookVerses(bibleId: string, bookId: string): Promise<{ verses: Verse[]; copyright: string | null }> {
  const params = new URLSearchParams({ action: 'book', bibleId, bookId });
  const response = await fetch(`/api/bible?${params.toString()}`);
  const body = (await response.json()) as {
    verses?: Verse[];
    fumsTokens?: string[];
    copyright?: string | null;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || 'Could not load book text');
  }
  if (body.fumsTokens?.length) {
    trackFums(body.fumsTokens);
  }
  return { verses: body.verses ?? [], copyright: body.copyright ?? null };
}
