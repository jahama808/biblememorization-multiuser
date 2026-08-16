import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE = 'https://api.scripture.api.bible/v1';
const CACHE_TTL_MS = 15 * 60 * 1000;

type CacheEntry = { expiresAt: number; value: unknown };
const memoryCache = new Map<string, CacheEntry>();

function apiKey(): string | undefined {
  return process.env.API_BIBLE_KEY || process.env.BIBLE_API_KEY;
}

function fromCache<T>(key: string): T | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value as T;
}

function toCache(key: string, value: unknown) {
  memoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function bibleGet(path: string): Promise<unknown> {
  const cached = fromCache<unknown>(path);
  if (cached) return cached;

  const key = apiKey();
  if (!key) {
    throw Object.assign(new Error('API_BIBLE_KEY is not configured'), { status: 500 });
  }

  const separator = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${separator}fums-version=3`;
  const response = await fetch(url, { headers: { 'api-key': key } });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (body as { message?: string; error?: string }).message ||
      (body as { error?: string }).error ||
      `API.Bible request failed (${response.status})`;
    throw Object.assign(new Error(message), { status: response.status });
  }

  toCache(path, body);
  return body;
}

type JsonNode = {
  type?: string;
  name?: string;
  text?: string;
  attrs?: { number?: string; style?: string };
  items?: JsonNode[];
};

export type VersePayload = {
  chapter: number;
  verse: number;
  text: string;
  reference: string;
};

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChapterHtml(html: string, chapterNumber: number): VersePayload[] {
  const cleaned = html
    .replace(/<p class="s[^"]*">[\s\S]*?<\/p>/gi, '')
    .replace(/<p class="d">[\s\S]*?<\/p>/gi, '');

  const verses: VersePayload[] = [];
  const pattern =
    /<span[^>]*(?:class="v"|data-number="\d+")[^>]*>(\d+)<\/span>([\s\S]*?)(?=<span[^>]*(?:class="v"|data-number=)|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned))) {
    const verse = Number(match[1]);
    const text = stripTags(match[2] ?? '');
    if (!verse || !text) continue;
    verses.push({
      chapter: chapterNumber,
      verse,
      text,
      reference: `${chapterNumber}:${verse}`,
    });
  }

  return verses;
}

function walkJson(nodes: JsonNode[] | undefined, chapterNumber: number, verses: VersePayload[]) {
  if (!nodes) return;
  let currentVerse: number | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentVerse && buffer.length) {
      const text = buffer.join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        verses.push({
          chapter: chapterNumber,
          verse: currentVerse,
          text,
          reference: `${chapterNumber}:${currentVerse}`,
        });
      }
    }
    buffer = [];
  };

  const visit = (node: JsonNode) => {
    const isVerseMarker =
      node.name === 'verse' ||
      node.attrs?.style === 'v' ||
      (node.type === 'tag' && node.name === 'verse');

    if (isVerseMarker && node.attrs?.number) {
      flush();
      currentVerse = Number(node.attrs.number);
    }

    if (node.type === 'text' && node.text && currentVerse) {
      buffer.push(node.text);
    }

    if (node.items) {
      for (const child of node.items) visit(child);
    }
  };

  for (const node of nodes) visit(node);
  flush();
}

function parseChapterContent(content: unknown, chapterNumber: number): VersePayload[] {
  if (typeof content === 'string') {
    return parseChapterHtml(content, chapterNumber);
  }
  if (Array.isArray(content)) {
    const verses: VersePayload[] = [];
    walkJson(content as JsonNode[], chapterNumber, verses);
    return verses;
  }
  return [];
}

function chapterNumberFromId(chapterId: string): number {
  const parts = chapterId.split('.');
  const last = parts[parts.length - 1];
  const num = Number(last);
  return Number.isFinite(num) ? num : 0;
}

async function fetchBook(bibleId: string, bookId: string) {
  const chaptersBody = (await bibleGet(`/bibles/${bibleId}/books/${bookId}/chapters`)) as {
    data?: Array<{ id: string; number: string }>;
    meta?: { fumsToken?: string };
  };

  const chapters = (chaptersBody.data ?? []).filter((chapter) => {
    const n = chapter.number?.toLowerCase();
    return n && n !== 'intro' && n !== 'front' && /^\d+$/.test(n);
  });

  const fumsTokens: string[] = [];
  if (chaptersBody.meta?.fumsToken) fumsTokens.push(chaptersBody.meta.fumsToken);

  const verses: VersePayload[] = [];
  const copyrights = new Set<string>();

  const concurrency = 5;
  for (let i = 0; i < chapters.length; i += concurrency) {
    const batch = chapters.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (chapter) => {
        const path =
          `/bibles/${bibleId}/chapters/${chapter.id}` +
          `?content-type=html&include-notes=false&include-titles=false` +
          `&include-chapter-numbers=false&include-verse-numbers=true`;
        return bibleGet(path) as Promise<{
          data?: { content?: unknown; copyright?: string };
          meta?: { fumsToken?: string };
        }>;
      }),
    );

    for (const [index, result] of results.entries()) {
      const chapter = batch[index];
      const number = Number(chapter.number) || chapterNumberFromId(chapter.id);
      if (result.meta?.fumsToken) fumsTokens.push(result.meta.fumsToken);
      if (result.data?.copyright) copyrights.add(result.data.copyright);
      verses.push(...parseChapterContent(result.data?.content, number));
    }
  }

  verses.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);

  return {
    verses,
    fumsTokens,
    copyright: [...copyrights][0] ?? null,
  };
}

function preferredRank(abbreviation: string, name: string): number {
  const hay = `${abbreviation} ${name}`.toUpperCase();
  if (/\bCSB\b/.test(hay) || hay.includes('CHRISTIAN STANDARD')) return 0;
  if (/\bNIV\b/.test(hay) || hay.includes('NEW INTERNATIONAL')) return 1;
  if (/\bKJV\b/.test(hay) || hay.includes('KING JAMES')) return 2;
  return 50;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const action = String(req.query.action ?? 'bibles');

    if (action === 'bibles') {
      const language = typeof req.query.language === 'string' ? req.query.language : undefined;
      const path = language ? `/bibles?language=${encodeURIComponent(language)}` : '/bibles';
      const body = (await bibleGet(path)) as {
        data?: Array<{
          id: string;
          name: string;
          nameLocal?: string;
          abbreviation: string;
          abbreviationLocal?: string;
          language?: { id?: string; name?: string };
        }>;
      };

      const bibles = (body.data ?? [])
        .map((bible) => ({
          id: bible.id,
          name: bible.nameLocal || bible.name,
          abbreviation: bible.abbreviationLocal || bible.abbreviation,
          language: bible.language?.name ?? bible.language?.id ?? '',
          languageId: bible.language?.id ?? '',
        }))
        .sort((a, b) => {
          const engA = a.languageId === 'eng' ? 0 : 1;
          const engB = b.languageId === 'eng' ? 0 : 1;
          if (engA !== engB) return engA - engB;
          const rank = preferredRank(a.abbreviation, a.name) - preferredRank(b.abbreviation, b.name);
          if (rank !== 0) return rank;
          return a.name.localeCompare(b.name);
        });

      return res.status(200).json({ bibles });
    }

    if (action === 'book') {
      const bibleId = String(req.query.bibleId ?? '');
      const bookId = String(req.query.bookId ?? '');
      if (!bibleId || !bookId) {
        return res.status(400).json({ error: 'bibleId and bookId are required' });
      }
      const result = await fetchBook(bibleId, bookId);
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : 'Server error';
    return res.status(status).json({ error: message });
  }
}
