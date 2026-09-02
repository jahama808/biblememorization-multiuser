import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FlipCard } from '../components/FlipCard';
import { Button, Card, ErrorNote, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { loadBookState, summarizeState, syncSchedule, writePracticeCompletions, type BookState } from '../lib/data';
import { practiceModeFromSearch, selectPracticeQueue } from '../lib/practice';
import type { PracticeItem } from '../lib/types';

export function PracticePage() {
  const { user } = useAuth();
  const location = useLocation();
  const [state, setState] = useState<BookState | null>(null);
  const [dueItems, setDueItems] = useState<PracticeItem[]>([]);
  const [queue, setQueue] = useState<PracticeItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const loaded = await loadBookState(user.id);
        const synced = loaded.book ? await syncSchedule(loaded) : loaded;
        if (!active) return;
        const summary = summarizeState(synced);
        const mode = practiceModeFromSearch(location.search);
        const items = selectPracticeQueue(summary, mode);
        setState(synced);
        setDueItems(summary.due);
        setQueue(items);
        setIndex(0);
        setFlipped(false);
        setDone(items.length === 0);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load practice');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, location.search]);

  const current = queue[index] ?? null;
  const progress = useMemo(() => (queue.length ? `${index + 1} of ${queue.length}` : '0 of 0'), [index, queue.length]);
  const reviewAvailable = dueItems.length > 0;

  function startAgain() {
    setQueue(dueItems);
    setIndex(0);
    setFlipped(false);
    setDone(false);
    setError(null);
  }

  async function finish() {
    if (!user || !state) return;
    setSaving(true);
    setError(null);
    try {
      await writePracticeCompletions(
        user.id,
        queue.map((item) => ({ chunkId: item.chunk.id, phase: item.tracker.phase })),
        state.today,
      );
      const refreshed = await loadBookState(user.id, state.today);
      const synced = await syncSchedule(refreshed);
      const summary = summarizeState(synced);
      setState(synced);
      setDueItems(summary.due);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save completions');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <p className="pt-16 text-center text-stone-500">Preparing today’s cards…</p>
      </Screen>
    );
  }

  if (!state?.book) {
    return (
      <Screen>
        <h1 className="font-serif text-3xl">Practice</h1>
        <p className="mt-2 text-stone-600">Set up a book before practicing.</p>
        <Link to="/book-setup" className="mt-4 text-sm font-semibold text-indigo-700">
          Go to book setup
        </Link>
      </Screen>
    );
  }

  if (done || !current) {
    return (
      <Screen>
        <h1 className="font-serif text-3xl text-stone-900">Practice</h1>
        <Card className="mt-5">
          <p className="font-serif text-2xl text-stone-900">{reviewAvailable ? 'Session complete' : 'Nothing due today'}</p>
          <p className="mt-2 text-sm text-stone-600">
            {reviewAvailable
              ? 'Completions are saved. Daily chunks graduate after 49 days; weekly chunks after 213 days. Extra practice does not change due dates.'
              : 'Weekly cards appear on their assigned weekday. Quarterly cards appear on their assigned Sunday.'}
          </p>
          {reviewAvailable ? (
            <Button className="mt-4 w-full" onClick={startAgain}>
              Practice again
            </Button>
          ) : null}
          <Link
            to="/"
            className={`${reviewAvailable ? 'mt-3' : 'mt-4'} inline-flex min-h-12 w-full items-center justify-center rounded-2xl ${
              reviewAvailable ? 'bg-stone-200 text-stone-800' : 'bg-indigo-700 text-white'
            } text-sm font-semibold`}
          >
            Back home
          </Link>
        </Card>
        <ErrorNote>{error}</ErrorNote>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-700">Practice</p>
          <h1 className="font-serif text-3xl text-stone-900">{state.book.book_name}</h1>
        </div>
        <p className="text-sm text-stone-500">{progress}</p>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <FlipCard
        bookName={state.book.book_name}
        chunk={current.chunk}
        phase={current.tracker.phase}
        flipped={flipped}
        onFlip={() => setFlipped((value) => !value)}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          disabled={index === 0}
          onClick={() => {
            setIndex((value) => Math.max(0, value - 1));
            setFlipped(false);
          }}
        >
          Previous
        </Button>
        {index < queue.length - 1 ? (
          <Button
            onClick={() => {
              setIndex((value) => value + 1);
              setFlipped(false);
            }}
          >
            Next
          </Button>
        ) : (
          <Button disabled={saving} onClick={() => void finish()}>
            {saving ? 'Saving…' : 'Finish'}
          </Button>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-stone-500">Flip cards only — no typing, no ease ratings.</p>
    </Screen>
  );
}
