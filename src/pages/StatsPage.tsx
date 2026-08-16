import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorNote, Screen, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { chunkLabel, loadBookState, summarizeState, syncSchedule, updateTimezone, type BookState } from '../lib/data';
import { formatDisplayDate, todayInTimeZone } from '../lib/dates';
import { WEEKDAY_NAMES } from '../lib/types';
import { DEFAULT_TIMEZONE } from '../lib/types';

const COMMON_ZONES = [
  'Pacific/Honolulu',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'UTC',
];

export function StatsPage() {
  const { user } = useAuth();
  const [state, setState] = useState<BookState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const profileFirst = await loadBookState(user.id, todayInTimeZone(DEFAULT_TIMEZONE));
        const today = todayInTimeZone(profileFirst.profile.timezone || DEFAULT_TIMEZONE);
        const loaded = today === profileFirst.today ? profileFirst : await loadBookState(user.id, today);
        const synced = loaded.book ? await syncSchedule(loaded) : loaded;
        if (active) setState(synced);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load stats');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  if (loading || !state) {
    return (
      <Screen>
        <p className="pt-16 text-center text-stone-500">Gathering stats…</p>
        <ErrorNote>{error}</ErrorNote>
      </Screen>
    );
  }

  if (!state.book) {
    return (
      <Screen>
        <h1 className="font-serif text-3xl">Stats</h1>
        <p className="mt-2 text-stone-600">Stats appear after you set up a book.</p>
        <Link to="/book-setup" className="mt-4 text-sm font-semibold text-indigo-700">
          Set up a book
        </Link>
      </Screen>
    );
  }

  const summary = summarizeState(state);

  return (
    <Screen>
      <h1 className="font-serif text-3xl text-stone-900">Stats</h1>
      <p className="mt-1 text-sm text-stone-500">
        {state.book.book_name} · {state.today}
      </p>
      <ErrorNote>{error}</ErrorNote>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Streak" value={summary.streak} hint="Consecutive Daily days" />
        <Stat label="Progress" value={`${summary.learned} / ${summary.total}`} hint="Chunks with a tracker" />
        <Stat label="Daily" value={summary.counts.daily} hint={`${summary.counts.dailyPending} scheduled later`} />
        <Stat label="Weekly" value={summary.counts.weekly} />
        <Stat label="Quarterly" value={summary.counts.quarterly} />
        <Stat label="Due today" value={summary.due.length} hint={`${summary.completedTodayCount} already done`} />
      </div>

      <Card className="mt-4">
        <h2 className="font-serif text-xl">Upcoming graduations</h2>
        {summary.upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">None in the next 21 days.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            {summary.upcoming.map((item) => (
              <li key={`${item.chunk.id}-${item.toPhase}`}>
                <span className="font-medium">{chunkLabel(state.book!.book_name, item.chunk)}</span>
                <span className="block text-stone-500">
                  {item.toPhase === 'WEEKLY' ? 'Daily → Weekly' : 'Weekly → Quarterly'} on {formatDisplayDate(item.onDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl">Queue</h2>
        {summary.nextQueued ? (
          <p className="mt-2 text-sm text-stone-700">
            Next unused chunk: {chunkLabel(state.book.book_name, summary.nextQueued)}. If Daily is empty, up to 7 are
            promoted on staggered Mondays. If Daily has fewer than 7, one more is promoted.
          </p>
        ) : (
          <p className="mt-2 text-sm text-stone-600">Every chunk is already in Daily, Weekly, or Quarterly.</p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl">Review days</h2>
        <ul className="mt-3 space-y-1 text-sm text-stone-700">
          {state.trackers
            .filter((tracker) => tracker.phase === 'WEEKLY' && tracker.review_day_of_week != null)
            .slice(0, 8)
            .map((tracker) => {
              const chunk = state.chunks.find((item) => item.id === tracker.chunk_id);
              if (!chunk) return null;
              return (
                <li key={tracker.id}>
                  {chunkLabel(state.book!.book_name, chunk)} · {WEEKDAY_NAMES[tracker.review_day_of_week ?? 0]}
                </li>
              );
            })}
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl">Timezone</h2>
        <p className="mt-1 text-sm text-stone-600">Default is Pacific/Honolulu. This is stored on your profile.</p>
        <select
          className="mt-3 min-h-12 w-full rounded-2xl border border-stone-300 bg-white px-3"
          value={state.profile.timezone}
          onChange={(event) => {
            const timezone = event.target.value;
            if (!user) return;
            void updateTimezone(user.id, timezone)
              .then(() => setState({ ...state, profile: { ...state.profile, timezone }, today: todayInTimeZone(timezone) }))
              .catch((err) => setError(err instanceof Error ? err.message : 'Could not update timezone'));
          }}
        >
          {[state.profile.timezone, ...COMMON_ZONES].filter((zone, index, all) => all.indexOf(zone) === index).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </Card>
    </Screen>
  );
}
