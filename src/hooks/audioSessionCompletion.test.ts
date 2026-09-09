import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { URL } from 'node:url';
import { resolveRepeatPlaybackTarget } from '../stores/audioPlaybackCompletionModel';
import {
  getAdjacentAudioPlaybackSequenceEntry,
  hasAudioPlaybackSequenceEntry,
} from '../stores/audioPlaybackSequenceModel';

const source = readFileSync(new URL('./useAudioPlayer.ts', import.meta.url), 'utf8');
const callback = source.slice(
  source.indexOf('async () => {', source.indexOf('const handlePlaybackFinished =')),
  source.indexOf('\n  }, [', source.indexOf('const handlePlaybackFinished =')) + 4
);

async function finishSession(repeatMode: string, queued: boolean, chapters = [7]) {
  const played: unknown[][] = [];
  let status = 'playing';
  const state = {
    autoAdvanceChapter: true,
    repeatMode,
    currentBookId: 'PRO',
    currentChapter: 7,
    currentTranslationId: 'bsb',
    duration: 1000,
    queue: queued ? [{ translationId: 'bsb', bookId: 'PRO', chapter: 8 }] : [],
    queueIndex: -1,
    setQueueIndex: () => {},
    playbackSequence: chapters.map((chapter) => ({ bookId: 'PRO', chapter })),
  };
  const finish = runInNewContext(`(${callback})`, {
    useAudioStore: { getState: () => state },
    emitAudioPlaybackProgress: () => {},
    stopAudioProgressTelemetryTimer: () => {},
    trackAnonymousUsageEvent: () => {},
    useLibraryStore: { getState: () => ({ recordHistory: () => {} }) },
    useProgressStore: { getState: () => ({ markChapterListened: () => {} }) },
    getBookById: () => ({ chapters: 31 }),
    resolveRepeatPlaybackTarget,
    advanceAudioQueue: () => (queued ? { queueIndex: 0, entry: state.queue[0] } : null),
    getAdjacentAudioPlaybackSequenceEntry,
    hasAudioPlaybackSequenceEntry,
    getAdjacentBibleChapter: () => ({ bookId: 'PRO', chapter: 8 }),
    // No exact chapter map in these sessions: BSB audio covers every chapter, so
    // completion falls back to plain canonical adjacency.
    audioChapterMapRef: { current: undefined },
    getAudioChaptersForBook: () => undefined,
    findAdjacentAvailableChapter: () => null,
    playChapterForTranslationRef: {
      current: async (...args: unknown[]) => {
        played.push(args);
      },
    },
    isChapterTransitioningRef: { current: false },
    clearBibleNowPlaying: () => {},
    clearAudioReturnTarget: () => {},
    setStatus: (next: string) => {
      status = next;
    },
    translationId: 'bsb',
  });
  await finish();
  return { played, status };
}

for (const repeat of ['off', 'chapter', 'book']) {
  for (const queued of [false, true]) {
    test(`daily proverb stops with repeat=${repeat}, queued=${queued}`, async () => {
      const result = await finishSession(repeat, queued);
      assert.equal(result.status, 'idle');
      assert.deepEqual(result.played, []);
    });
  }
}

test('multi-chapter session advances within its own sequence before queued audio', async () => {
  const result = await finishSession('book', true, [7, 9]);
  assert.deepEqual(result.played, [['bsb', 'PRO', 9]]);
});

test('ordinary Bible playback still advances without a session', async () => {
  const result = await finishSession('off', false, []);
  assert.deepEqual(result.played, [['bsb', 'PRO', 8]]);
});
