import { formatChunkReference } from '../lib/schedule';
import type { Chunk, Phase } from '../lib/types';

const phaseLabel: Record<Phase, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  QUARTERLY: 'Quarterly',
};

export function FlipCard({
  bookName,
  chunk,
  phase,
  flipped,
  onFlip,
}: {
  bookName: string;
  chunk: Chunk;
  phase: Phase;
  flipped: boolean;
  onFlip: () => void;
}) {
  return (
    <button type="button" onClick={onFlip} className="flip-card block w-full text-left">
      <div className={`flip-inner relative min-h-[22rem] ${flipped ? 'is-flipped' : ''}`}>
        <div className="flip-face absolute inset-0 rounded-3xl border border-indigo-100 bg-indigo-950 p-6 text-indigo-50 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">{phaseLabel[phase]}</p>
          <p className="mt-10 font-serif text-3xl leading-snug">{formatChunkReference(bookName, chunk.start_verse, chunk.end_verse)}</p>
          <p className="absolute bottom-6 left-6 text-sm text-indigo-200">Tap to reveal the text</p>
        </div>
        <div className="flip-back flip-face absolute inset-0 overflow-auto rounded-3xl border border-stone-200 bg-white p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
            {formatChunkReference(bookName, chunk.start_verse, chunk.end_verse)}
          </p>
          <p className="mt-5 font-serif text-xl leading-relaxed text-stone-800">{chunk.verse_text}</p>
          <p className="mt-6 text-sm text-stone-500">Tap to hide</p>
        </div>
      </div>
    </button>
  );
}
