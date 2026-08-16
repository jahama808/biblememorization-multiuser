import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorNote, Screen, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { chunkLabel, loadBookState, summarizeState, syncSchedule, type BookState } from '../lib/data';
import { formatChunkReference } from '../lib/schedule';
import { WEEKDAY_NAMES } from '../lib/types';

export function HomePage() {
  const { user, signOut } = useAuth();
  const [state, setState] = useState<BookState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const loaded = await loadBookState(user.id);
        const synced = loaded.book ? await syncSchedule(loaded) : loaded;
        if (active) setState(synced);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your book');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  if (loading) {
    return (
      <Screen>
        <p className="pt-16 text-center text-stone-500">Loading your place…</p>
      </Screen>
    );
  }

  if (!state?.book) {
    return (
      <Screen>
        <header className="mb-6">
          <p className="text-sm font-medium text-indigo-700">Scripture Memory</p>
          <h1 className="mt-1 font-serif text-3xl text-stone-900">Begin with one book</h1>
          <p className="mt-2 text-stone-600">Choose a translation and a Protestant book, then break it into 25–40 word chunks.</p>
        </header>
        <ErrorNote>{error}</ErrorNote>
        <Link
          to="/book-setup"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-indigo-700 px-4 text-sm font-semibold text-white"
        >
          Set up your book
        </Link>
      </Screen>
    );
  }

  const summary = summarizeState(state);
  const nextDue = summary.dueRemaining[0];

  return (
    <Screen>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-indigo-700">Scripture Memory</p>
          <h1 className="mt-1 font-serif text-3xl text-stone-900">{state.book.book_name}</h1>
          <p className="text-sm text-stone-500">{state.book.translation_name}</p>
        </div>
        <button type="button" onClick={() => void signOut()} className="text-sm font-medium text-stone-500">
          Sign out
        </button>
      </header>

      <ErrorNote>{error}</ErrorNote>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Daily streak" value={summary.streak} hint="From Daily completions" />
        <Stat label="Book progress" value={`${summary.learned}/${summary.total}`} hint="Chunks in a review phase" />
        <Stat label="Daily" value={summary.counts.daily} hint={summary.counts.dailyPending ? `${summary.counts.dailyPending} start later` : 'Active now'} />
        <Stat label="Weekly / Quarterly" value={`${summary.counts.weekly} / ${summary.counts.quarterly}`} />
      </div>

      <Card className="mt-4">
        <h2 className="font-serif text-xl text-stone-900">Today</h2>
        {summary.dueRemaining.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            {summary.due.length ? 'Today’s cards are finished. Come back tomorrow.' : 'Nothing is due today. New Daily chunks start on their assigned Monday.'}
          </p>
        ) : (
          <p className="mt-2 text-sm text-stone-600">
            {summary.dueRemaining.length} card{summary.dueRemaining.length === 1 ? '' : 's'} ready
            {nextDue
              ? ` · next ${formatChunkReference(state.book.book_name, nextDue.chunk.start_verse, nextDue.chunk.end_verse)}`
              : ''}
          </p>
        )}
        <Link
          to="/practice"
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-indigo-700 px-4 text-sm font-semibold text-white"
        >
          {summary.dueRemaining.length ? 'Start practice' : 'Review practice'}
        </Link>
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl text-stone-900">Coming up</h2>
        {summary.upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">No graduations in the next three weeks.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {summary.upcoming.slice(0, 4).map((item) => (
              <li key={item.chunk.id} className="flex justify-between gap-3 text-stone-700">
                <span>{chunkLabel(state.book!.book_name, item.chunk)}</span>
                <span className="shrink-0 text-stone-500">
                  → {item.toPhase === 'WEEKLY' ? 'Weekly' : 'Quarterly'} in {item.daysRemaining}d
                </span>
              </li>
            ))}
          </ul>
        )}
        {summary.nextQueued ? (
          <p className="mt-3 text-sm text-stone-600">
            Next in queue: {chunkLabel(state.book.book_name, summary.nextQueued)}
          </p>
        ) : (
          <p className="mt-3 text-sm text-stone-600">The queue is empty — every chunk has a phase.</p>
        )}
      </Card>

      {summary.due.some((item) => item.tracker.phase === 'WEEKLY') ? (
        <p className="mt-4 text-center text-xs text-stone-500">
          Weekly reviews land on {WEEKDAY_NAMES[summary.due.find((item) => item.tracker.phase === 'WEEKLY')?.tracker.review_day_of_week ?? 0]}.
        </p>
      ) : null}
    </Screen>
  );
}
