/**
 * The "End of chapter" sleep timer: the chapter that is playing finishes, and nothing
 * follows it. Runs the real finish handler against the real audio store, with no reader
 * mounted (the usual case: the listener is asleep with the phone locked).
 */
import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import { installBibleStoreDoubles } from '../../stores/__tests__/bibleStoreDoubles';
import type { AudioPlayerSession, PlayChapterForTranslation } from './playerSession';

const mmkv = mockMmkvStorage(mock);
installBibleStoreDoubles(mock);

let nowPlayingCleared = 0;
mockModule(mock, sourcePath('services/audio/index.ts'), {
  audioPlayer: { isLoaded: () => true },
  clearBibleNowPlaying: async () => {
    nowPlayingCleared += 1;
  },
});
mockModule(mock, sourcePath('services/analytics/index.ts'), {
  trackAnonymousUsageEvent: () => {},
});
mockModule(mock, sourcePath('services/audio/audioChapterCoverage.ts'), {
  peekAudioChapterMap: () => undefined,
  resolveAudioChapterMap: async () => undefined,
});
const history: [string, number][] = [];
mockModule(mock, sourcePath('stores/libraryStore.ts'), {
  useLibraryStore: {
    getState: () => ({
      recordHistory: (bookId: string, chapter: number) => {
        history.push([bookId, chapter]);
      },
    }),
  },
});
const listened: [string, number][] = [];
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore: {
    getState: () => ({
      markChapterListened: (bookId: string, chapter: number) => {
        listened.push([bookId, chapter]);
      },
      recordListeningTime: () => {},
    }),
  },
});

let finishChapterAndAdvance: (typeof import('./playbackCompletion'))['finishChapterAndAdvance'];
let useAudioStore: (typeof import('../../stores/audioStore'))['useAudioStore'];
let shared: typeof import('./sharedPlaybackState');

before(async () => {
  ({ finishChapterAndAdvance } = await import('./playbackCompletion'));
  ({ useAudioStore } = await import('../../stores/audioStore'));
  shared = await import('./sharedPlaybackState');
});

const played: string[] = [];

function makeSession(): AudioPlayerSession {
  const playChapterForTranslation: PlayChapterForTranslation = async (
    translationId,
    bookId,
    chapter
  ) => {
    played.push(`${bookId} ${chapter}`);
    useAudioStore.getState().setCurrentTrack(translationId, bookId, chapter);
    useAudioStore.getState().setDuration(300_000);
    useAudioStore.getState().setStatus('playing');
  };
  return {
    playRequestId: 0,
    playbackErrorId: 0,
    lastPlaybackError: null,
    loadingPlayRequestId: null,
    isMounted: false,
    interpolationTimer: null,
    lastPollPosition: 0,
    lastPollTime: 0,
    lastNowPlayingSignature: null,
    pause: null,
    playChapterForTranslation,
  };
}

const session = makeSession();
const store = () => useAudioStore.getState();

async function playing(bookId: string, chapter: number): Promise<void> {
  await session.playChapterForTranslation?.('bsb', bookId, chapter);
  played.length = 0;
}

async function finishPlaying(): Promise<void> {
  await finishChapterAndAdvance({
    session,
    fallbackTranslationId: 'bsb',
    resolveAudioCoverage: async () => undefined,
  });
}

beforeEach(() => {
  mmkv.store.clear();
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  played.length = 0;
  history.length = 0;
  listened.length = 0;
  nowPlayingCleared = 0;
  shared.pausedByListener.current = false;
  shared.chapterTransition.current = false;
});

test('with the timer set to the end of the chapter, playback ends instead of advancing', async () => {
  await playing('GEN', 1);
  store().setSleepTimer('end-of-chapter');

  await finishPlaying();

  assert.deepEqual(played, []);
  assert.equal(store().status, 'idle');
  assert.equal(nowPlayingCleared, 1, 'the lock screen entry goes with it');
});

test('the finished chapter still counts as heard', async () => {
  await playing('GEN', 1);
  history.length = 0;
  store().setSleepTimer('end-of-chapter');

  await finishPlaying();

  assert.deepEqual(listened, [['GEN', 1]]);
  assert.deepEqual(history, [['GEN', 1]]);
});

test('the timer is used up once it has stopped playback', async () => {
  await playing('GEN', 1);
  store().setSleepTimer('end-of-chapter');

  await finishPlaying();

  assert.equal(store().sleepTimerMinutes, null);
  assert.equal(store().sleepTimerEndTime, null);
  assert.equal(store().sleepTimerRemainingMs, null);
});

test('the stop counts as the listener pausing, so an interruption ending cannot restart it', async () => {
  await playing('GEN', 1);
  store().setSleepTimer('end-of-chapter');
  shared.chapterTransition.current = true;

  await finishPlaying();

  assert.equal(shared.pausedByListener.current, true);
  assert.equal(shared.chapterTransition.current, false, 'the music bed stops too');
});

test('a plan session does not move on to its next chapter', async () => {
  store().setPlaybackSequence([
    { bookId: 'PSA', chapter: 1 },
    { bookId: 'PSA', chapter: 2 },
  ]);
  await playing('PSA', 1);
  store().setSleepTimer('end-of-chapter');

  await finishPlaying();

  assert.deepEqual(played, []);
  assert.equal(store().status, 'idle');
});

test('repeat does not play the chapter again', async () => {
  await playing('JHN', 3);
  store().setRepeatMode('chapter');
  store().setSleepTimer('end-of-chapter');

  await finishPlaying();

  assert.deepEqual(played, []);
});

test('the queue does not move on', async () => {
  await playing('GEN', 1);
  store().addToQueue('bsb', 'GEN', 1);
  store().addToQueue('bsb', 'EXO', 1);
  store().setSleepTimer('end-of-chapter');

  await finishPlaying();

  assert.deepEqual(played, []);
});

test('a chapter skipped to by hand keeps the timer armed, and it is that chapter that ends', async () => {
  await playing('GEN', 1);
  store().setSleepTimer('end-of-chapter');

  // A skip: the next chapter loads and plays, as a lock-screen Next would.
  store().setStatus('loading');
  await playing('GEN', 2);
  store().setStatus('paused');
  store().setStatus('playing');
  assert.equal(store().sleepTimerMinutes, 'end-of-chapter');

  await finishPlaying();

  assert.deepEqual(played, []);
  assert.equal(store().currentChapter, 2);
  assert.equal(store().status, 'idle');
});

test('a minutes timer still lets the chapter advance at its end', async () => {
  await playing('GEN', 1);
  store().setSleepTimer(30);

  await finishPlaying();

  assert.deepEqual(played, ['GEN 2']);
  assert.equal(store().sleepTimerMinutes, 30);
});

test('with no timer, the chapter advances as before', async () => {
  await playing('GEN', 1);

  await finishPlaying();

  assert.deepEqual(played, ['GEN 2']);
});
