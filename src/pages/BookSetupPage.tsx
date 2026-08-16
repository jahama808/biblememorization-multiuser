import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ErrorNote, FieldLabel, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { fetchBibleVersions, fetchBookVerses } from '../lib/bible';
import { PROTESTANT_BOOKS } from '../lib/books';
import { autoChunkVerses, chunkWordTone, draftVerseText, draftsFromBreaks, toggleBreak } from '../lib/chunks';
import { saveNewBook } from '../lib/data';
import { todayInTimeZone } from '../lib/dates';
import { formatChunkReference } from '../lib/schedule';
import type { BibleVersion, DraftChunk, OnboardingPhase, Verse } from '../lib/types';
import { TARGET_CHUNK_MAX, TARGET_CHUNK_MIN } from '../lib/types';

type Step = 'translation' | 'book' | 'chunks' | 'onboarding';

const toneClass = {
  ok: 'bg-emerald-50 text-emerald-800',
  short: 'bg-amber-50 text-amber-800',
  long: 'bg-rose-50 text-rose-800',
};

export function BookSetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('translation');
  const [versions, setVersions] = useState<BibleVersion[]>([]);
  const [version, setVersion] = useState<BibleVersion | null>(null);
  const [query, setQuery] = useState('');
  const [bookId, setBookId] = useState<string | null>(null);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [copyright, setCopyright] = useState<string | null>(null);
  const [breaks, setBreaks] = useState<number[]>([]);
  const [onboardings, setOnboardings] = useState<OnboardingPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const book = PROTESTANT_BOOKS.find((item) => item.id === bookId) ?? null;
  const drafts = useMemo(() => draftsFromBreaks(verses, breaks, onboardings), [verses, breaks, onboardings]);

  useEffect(() => {
    let active = true;
    fetchBibleVersions()
      .then((list) => {
        if (!active) return;
        setVersions(list);
        setVersion(list[0] ?? null);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load translations');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredBooks = PROTESTANT_BOOKS.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  async function loadBook(nextBookId: string) {
    if (!version) return;
    setError(null);
    setBusy(true);
    setBookId(nextBookId);
    try {
      const result = await fetchBookVerses(version.id, nextBookId);
      if (result.verses.length === 0) {
        throw new Error('This translation did not return verses for that book.');
      }
      const suggested = autoChunkVerses(result.verses);
      setVerses(result.verses);
      setCopyright(result.copyright);
      setBreaks(suggested.slice(1).map((draft) => draft.startIndex));
      setOnboardings(suggested.map(() => 'NONE'));
      setStep('chunks');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch the book');
    } finally {
      setBusy(false);
    }
  }

  function updateBreaks(next: number[]) {
    const nextDrafts = draftsFromBreaks(verses, next, []);
    setBreaks(next);
    setOnboardings(nextDrafts.map((_, index) => onboardings[index] ?? 'NONE'));
  }

  function setOnboarding(index: number, phase: OnboardingPhase) {
    setOnboardings((current) => current.map((value, i) => (i === index ? phase : value)));
  }

  async function save() {
    if (!user || !version || !book) return;
    setBusy(true);
    setError(null);
    try {
      await saveNewBook({
        userId: user.id,
        bookName: book.name,
        translationId: version.id,
        translationName: `${version.abbreviation} · ${version.name}`,
        today: todayInTimeZone(),
        chunks: drafts.map((draft, index) => ({
          start_verse: draft.verses[0].reference,
          end_verse: draft.verses[draft.verses.length - 1].reference,
          verse_text: draftVerseText(draft),
          display_order: index + 1,
          word_count: draft.wordCount,
          onboarding: onboardings[index] ?? 'NONE',
        })),
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this book');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <p className="text-sm font-medium text-indigo-700">Book setup</p>
      <h1 className="mt-1 font-serif text-3xl text-stone-900">One active book</h1>
      <p className="mt-2 text-sm text-stone-600">
        Switching books deactivates the previous selection. Verse text is fetched from API.Bible — nothing is stored as a full-Bible cache.
      </p>
      <ErrorNote>{error}</ErrorNote>

      {step === 'translation' ? (
        <Card className="mt-5">
          <h2 className="font-serif text-xl">Translation</h2>
          <p className="mt-1 text-sm text-stone-600">CSB, NIV, and KJV appear first when your API.Bible account includes them.</p>
          {loading ? <p className="mt-4 text-sm text-stone-500">Loading versions…</p> : null}
          <div className="mt-4 max-h-[28rem] space-y-2 overflow-auto">
            {versions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setVersion(item)}
                className={`w-full rounded-2xl border px-4 py-3 text-left ${
                  version?.id === item.id ? 'border-indigo-600 bg-indigo-50' : 'border-stone-200 bg-white'
                }`}
              >
                <p className="font-semibold text-stone-900">
                  {item.abbreviation} <span className="font-normal text-stone-500">· {item.language}</span>
                </p>
                <p className="text-sm text-stone-600">{item.name}</p>
              </button>
            ))}
          </div>
          <Button className="mt-4 w-full" disabled={!version} onClick={() => setStep('book')}>
            Continue
          </Button>
        </Card>
      ) : null}

      {step === 'book' ? (
        <Card className="mt-5">
          <h2 className="font-serif text-xl">Protestant book</h2>
          <FieldLabel>Search</FieldLabel>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-12 w-full rounded-2xl border border-stone-300 px-4"
            placeholder="John, Psalms…"
          />
          <div className="mt-4 max-h-[24rem] space-y-4 overflow-auto">
            {(['OT', 'NT'] as const).map((testament) => (
              <div key={testament}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {testament === 'OT' ? 'Old Testament' : 'New Testament'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {filteredBooks
                    .filter((item) => item.testament === testament)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void loadBook(item.id)}
                        className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3 text-left text-sm font-medium text-stone-800"
                      >
                        {item.name}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setStep('translation')}>
            Back
          </Button>
          {busy ? <p className="mt-2 text-center text-sm text-stone-500">Fetching verse text…</p> : null}
        </Card>
      ) : null}

      {step === 'chunks' && book ? (
        <ChunkEditor
          bookName={book.name}
          verses={verses}
          drafts={drafts}
          copyright={copyright}
          busy={busy}
          onToggle={(index) => updateBreaks(toggleBreak(breaks, index))}
          onAuto={() => {
            const suggested = autoChunkVerses(verses);
            updateBreaks(suggested.slice(1).map((draft) => draft.startIndex));
          }}
          onBack={() => setStep('book')}
          onNext={() => {
            setOnboardings((current) => drafts.map((_, index) => current[index] ?? 'NONE'));
            setStep('onboarding');
          }}
        />
      ) : null}

      {step === 'onboarding' && book ? (
        <Card className="mt-5">
          <h2 className="font-serif text-xl">Already memorized?</h2>
          <p className="mt-1 text-sm text-stone-600">
            Optional. Assign chunks you already know. Everything else waits in the queue and is promoted into Daily as space opens.
          </p>
          <ul className="mt-4 max-h-[24rem] space-y-3 overflow-auto">
            {drafts.map((draft, index) => (
              <li key={`${draft.startIndex}-${draft.endIndex}`} className="rounded-2xl border border-stone-200 p-3">
                <p className="text-sm font-semibold">
                  {formatChunkReference(book.name, draft.verses[0].reference, draft.verses[draft.verses.length - 1].reference)}
                </p>
                <p className="text-xs text-stone-500">{draft.wordCount} words</p>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {(['NONE', 'DAILY', 'WEEKLY', 'QUARTERLY'] as OnboardingPhase[]).map((phase) => (
                    <button
                      key={phase}
                      type="button"
                      onClick={() => setOnboarding(index, phase)}
                      className={`rounded-xl px-1 py-2 text-[11px] font-semibold ${
                        (onboardings[index] ?? 'NONE') === phase ? 'bg-indigo-700 text-white' : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {phase === 'NONE' ? 'Queue' : phase[0] + phase.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <Button className="mt-4 w-full" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save book'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setStep('chunks')}>
            Back
          </Button>
        </Card>
      ) : null}
    </Screen>
  );
}

function ChunkEditor({
  bookName,
  verses,
  drafts,
  copyright,
  busy,
  onToggle,
  onAuto,
  onBack,
  onNext,
}: {
  bookName: string;
  verses: Verse[];
  drafts: DraftChunk[];
  copyright: string | null;
  busy: boolean;
  onToggle: (verseIndex: number) => void;
  onAuto: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  let cursor = 0;

  return (
    <Card className="mt-5">
      <h2 className="font-serif text-xl">Chunk breaks</h2>
      <p className="mt-1 text-sm text-stone-600">
        Tap between verses to start a new chunk. Aim for {TARGET_CHUNK_MIN}–{TARGET_CHUNK_MAX} words.
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onAuto}>
          Auto-split
        </Button>
        <p className="flex items-center text-xs text-stone-500">{drafts.length} chunks</p>
      </div>
      <div className="mt-4 max-h-[28rem] space-y-1 overflow-auto">
        {drafts.map((draft, draftIndex) => {
          const start = cursor;
          cursor += draft.verses.length;
          return (
            <div key={`${draft.startIndex}-${draft.endIndex}`} className="rounded-2xl bg-stone-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-stone-500">
                  {formatChunkReference(bookName, draft.verses[0].reference, draft.verses[draft.verses.length - 1].reference)}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass[chunkWordTone(draft.wordCount)]}`}>
                  {draft.wordCount} words
                </span>
              </div>
              {draft.verses.map((verse, offset) => {
                const verseIndex = start + offset;
                return (
                  <div key={verse.reference}>
                    {offset > 0 ? (
                      <button
                        type="button"
                        onClick={() => onToggle(verseIndex)}
                        className="my-1 flex w-full items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-wide text-indigo-700"
                      >
                        <span className="h-px flex-1 bg-indigo-200" />
                        Remove break
                        <span className="h-px flex-1 bg-indigo-200" />
                      </button>
                    ) : draftIndex > 0 ? (
                      <button
                        type="button"
                        onClick={() => onToggle(verseIndex)}
                        className="mb-2 flex w-full items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-400"
                      >
                        <span className="h-px flex-1 bg-stone-300" />
                        Keep together
                        <span className="h-px flex-1 bg-stone-300" />
                      </button>
                    ) : null}
                    <p className="font-serif text-[15px] leading-relaxed text-stone-800">
                      <span className="mr-2 align-super text-[11px] font-sans font-semibold text-indigo-700">{verse.reference}</span>
                      {verse.text}
                    </p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {copyright ? <p className="mt-3 text-[11px] leading-relaxed text-stone-500">{copyright}</p> : null}
      <Button className="mt-4 w-full" disabled={busy || drafts.length === 0} onClick={onNext}>
        Continue
      </Button>
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Back
      </Button>
    </Card>
  );
}
