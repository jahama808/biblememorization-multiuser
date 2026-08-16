import { describe, expect, it } from 'vitest';
import { scriptureApiUrl } from '../../api/bible';

describe('scriptureApiUrl', () => {
  it('does not add fums-version on list endpoints', () => {
    expect(scriptureApiUrl('/bibles')).toBe('https://api.scripture.api.bible/v1/bibles');
    expect(scriptureApiUrl('/bibles?language=eng')).toBe('https://api.scripture.api.bible/v1/bibles?language=eng');
    expect(scriptureApiUrl('/bibles/abc/books/JHN/chapters')).toBe(
      'https://api.scripture.api.bible/v1/bibles/abc/books/JHN/chapters',
    );
  });

  it('adds fums-version only on chapter content fetches', () => {
    const path =
      '/bibles/abc/chapters/JHN.3?content-type=html&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true';
    expect(scriptureApiUrl(path, true)).toBe(`https://api.scripture.api.bible/v1${path}&fums-version=3`);
  });
});
