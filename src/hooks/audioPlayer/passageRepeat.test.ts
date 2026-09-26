/**
 * Passage repeat against the real audio store and the real finish handler, with the
 * native player, verse timings and coverage faked. The player here plays whatever it
 * is told to, like the one a closed reader leaves behind.
 */
import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import type { AudioChapterMap } from '../../services/bible/contentAvailability';
import type { TrackPlayerProgressSnapshot } from '../../services/audio/audioPlayer';
import type { RepeatPassage } from '../../types';
import type { AudioPlayerSession, PlayChapterOptions } from './playerSession';

const mmkv = mockMmkvStorage(mock);
mockReactNative(mock, { os: 'ios' });

// --- the native player ----------------------------------------------------------
const player = { loaded: false, seeks: [] as number[], stops: 0 };
mockModule(mock, sourcePath('services/audio/index.ts'), {
  audioPlayer: {
    isLoaded: () => player.loaded,
    seekTo: async (positionMs: number) => {
      player.seeks.push(positionMs);
    },
    stop: async () => {
      player.stops += 1;
      player.loaded = false;
    },
  },
  clearBibleNowPlaying: async () => {},
});

// --- verse timings: BSB John 3 and 4 have them, nothing else does --------------------
const JOHN_3 = { 1: 4.92, 2: 10.04, 3: 22.04, 4: 29.3, 5: 37.64, 6: 46.42 };
const JOHN_4 = { 1: 3.1, 2: 9.5, 3: 15.2, 4: 21.8 };
const timingRequests: string[] = [];
mockModule(mock, sourcePath('services/bible/verseTimestamps.ts'), {
  getChapterTimestamps: async (translationId: string, bookId: string, chapter: number) => {
    timingRequests.push(`${translationId}/${bookId}/${chapter}`);
    if (translationId !== 'bsb' || bookId !== 'JHN') return null;
    return chapter === 3 ? JOHN_3 : chapter === 4 ? JOHN_4 : null;
  },
});

// --- what the finish handler touches besides the passage ------------------------------
const followed: string[] = [];
mockModule(mock, sourcePath('hooks/audioPlayer/readingPositionFollow.ts'), {
  followAutoAdvancedChapter: (
    from: { bookId: string; chapter: number },
    to: { bookId: string; chapter: number }
  ) => {
    followed.push(`${from.bookId} ${from.chapter} -> ${to.bookId} ${to.chapter}`);
  },
});
mockModule(mock, sourcePath('hooks/audioPlayer/useAudioCoverage.ts'), {
  getAdjacentAudioChapter: (bookId: string, chapter: number) => ({ bookId, chapter: chapter + 1 }),
});
mockModule(mock, sourcePath('services/analytics/index.ts'), {
  trackAnonymousUsageEvent: () => {},
});
mockModule(mock, sourcePath('stores/libraryStore.ts'), {
  useLibraryStore: { getState: () => ({ recordHistory: () => {} }) },
});
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore: {
    getState: () => ({ markChapterListened: () => {}, recordListeningTime: () => {} }),
  },
});

type PassageRepeat = typeof import('./passageRepeat');
let passageRepeat: PassageRepeat;
let finishChapterAndAdvance: (typeof import('./playbackCompletion'))['finishChapterAndAdvance'];
let seekPlayback: (typeof import('./transportControls'))['seekPlayback'];
let useAudioStore: (typeof import('../../stores/audioStore'))['useAudioStore'];
let resolvePlaybackStart: (typeof import('../../services/audio/audioPlaybackStartModel'))['resolvePlaybackStart'];

before(async () => {
  passageRepeat = await import('./passageRepeat');
  ({ finishChapterAndAdvance } = await import('./playbackCompletion'));
  ({ seekPlayback } = await import('./transportControls'));
  ({ useAudioStore } = await import('../../stores/audioStore'));
  ({ resolvePlaybackStart } = await import('../../services/audio/audioPlaybackStartModel'));
});

interface PlayCall {
  translationId: string;
  bookId: string;
  chapter: number;
  startPositionMs: number;
}

const plays: PlayCall[] = [];
let coverage: AudioChapterMap | undefined;

function makeSession(): AudioPlayerSession {
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
    playChapterForTranslation: async (
      translationId: string,
      bookId: string,
      chapter: number,
      _verse?: number,
      options?: PlayChapterOptions
    ) => {
      // As the real load: a new command, then the chapter playing from its start point.
      session.playRequestId += 1;
      const startPositionMs = options?.startPositionMs ?? 0;
      plays.push({ translationId, bookId, chapter, startPositionMs });
      player.loaded = true;
      const store = useAudioStore.getState();
      store.setCurrentTrack(translationId, bookId, chapter, startPositionMs);
      store.setDuration(300_000);
      store.setStatus('playing');
    },
  };
}

const session = makeSession();

const context = () => ({
  session,
  fallbackTranslationId: 'bsb',
  resolveAudioCoverage: async () => coverage,
});

const passage = (
  bookId: string,
  start: [number, number],
  end: [number, number]
): RepeatPassage => ({
  bookId,
  start: { chapter: start[0], verse: start[1] },
  end: { chapter: end[0], verse: end[1] },
});

/** Timings are read 150 ms early; see PASSAGE_TIMESTAMP_LEAD_MS. */
const at = (seconds: number) => Math.round(seconds * 1000) - 150;

beforeEach(() => {
  mmkv.store.clear();
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  passageRepeat.resetPassageRepeatState();
  player.loaded = false;
  player.seeks.length = 0;
  player.stops = 0;
  plays.length = 0;
  followed.length = 0;
  timingRequests.length = 0;
  coverage = undefined;
  session.playRequestId = 0;
});

/** A chapter already playing (or paused) at `positionMs`, loaded in the native player. */
function loaded(
  bookId: string,
  chapter: number,
  positionMs: number,
  status: 'playing' | 'paused' = 'playing',
  translationId = 'bsb'
): void {
  const store = useAudioStore.getState();
  store.setCurrentTrack(translationId, bookId, chapter, positionMs);
  store.setDuration(300_000);
  store.setStatus(status);
  player.loaded = true;
}

/** Passage repeat already on before this chapter started, so nothing engages. */
function repeating(value: RepeatPassage): void {
  useAudioStore.setState({ repeatPassage: value, repeatMode: 'passage' });
}

async function progress(positionMs: number): Promise<void> {
  useAudioStore.getState().setPosition(positionMs);
  const snapshot: TrackPlayerProgressSnapshot = {
    isLoaded: true,
    positionMillis: positionMs,
    durationMillis: 300_000,
    isPlaying: useAudioStore.getState().status === 'playing',
    isBuffering: false,
    didJustFinish: false,
  };
  passageRepeat.watchPassageProgress(context(), snapshot);
  await passageRepeat.passageRepeatSettled();
}

async function finish(): Promise<void> {
  await finishChapterAndAdvance({
    session,
    fallbackTranslationId: 'bsb',
    resolveAudioCoverage: async () => coverage,
  });
}

const track = () => {
  const { currentTranslationId, currentBookId, currentChapter, currentPosition, status } =
    useAudioStore.getState();
  return {
    translationId: currentTranslationId,
    bookId: currentBookId,
    chapter: currentChapter,
    positionMs: currentPosition,
    status,
  };
};

// --- the end verse ------------------------------------------------------------------

test('playing past the end verse of a one-chapter passage seeks back to its start verse', async () => {
  repeating(passage('JHN', [3, 3], [3, 4]));
  loaded('JHN', 3, 30_000);

  await progress(36_000); // loads the timings
  await progress(37_000);
  assert.deepEqual(player.seeks, []);
  await progress(38_000); // verse 5 starts at 37.64 s

  assert.deepEqual(player.seeks, [at(22.04)]);
  assert.equal(track().positionMs, at(22.04));
  assert.deepEqual(plays, [], 'a seek, not a reload');
});

test('just before the end verse a timer loops exactly on time', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  repeating(passage('JHN', [3, 3], [3, 4]));
  loaded('JHN', 3, 30_000);

  await progress(35_000);
  await progress(36_700); // 790 ms before verse 5's cut
  assert.deepEqual(player.seeks, []);

  t.mock.timers.tick(789);
  await passageRepeat.passageRepeatSettled();
  assert.deepEqual(player.seeks, []);
  t.mock.timers.tick(1);
  await passageRepeat.passageRepeatSettled();
  assert.deepEqual(player.seeks, [at(22.04)]);

  // The report that was already on its way does not loop a second time.
  await progress(37_700);
  assert.deepEqual(player.seeks, [at(22.04)]);
});

test('a pause before the timer fires cancels the loop', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  repeating(passage('JHN', [3, 3], [3, 4]));
  loaded('JHN', 3, 30_000);
  await progress(35_000);
  await progress(36_700);

  useAudioStore.getState().setStatus('paused');
  await progress(36_800);
  t.mock.timers.tick(2_000);
  await passageRepeat.passageRepeatSettled();

  assert.deepEqual(player.seeks, []);
});

test('a seek past the end verse plays on, and the end of the chapter goes back to the start', async () => {
  repeating(passage('JHN', [3, 3], [3, 4]));
  loaded('JHN', 3, 30_000);
  await progress(34_000);
  await progress(35_000);

  await seekPlayback(session, 37_600); // just past the cut at 37.49 s
  player.seeks.length = 0;
  await progress(37_600);
  await progress(38_600);
  assert.deepEqual(player.seeks, [], 'the listener moved past the end; not taken as reaching it');

  // Well past: a big seek.
  await seekPlayback(session, 120_000);
  player.seeks.length = 0;
  await progress(120_000);
  await progress(121_000);
  assert.deepEqual(player.seeks, []);

  await finish();
  assert.deepEqual(plays, [
    { translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: at(22.04) },
  ]);
});

test('a chapter that starts past the end verse plays on to its end', async () => {
  repeating(passage('JHN', [3, 3], [3, 4]));
  loaded('JHN', 3, 60_000);
  await progress(60_000);
  await progress(61_000);
  await progress(62_000);
  assert.deepEqual(player.seeks, []);
});

test('the end verse of a cross-chapter passage loads the start chapter at the start verse', async () => {
  repeating(passage('JHN', [3, 3], [4, 2]));
  loaded('JHN', 4, 12_000);

  await progress(14_000);
  await progress(15_500); // verse 3 of John 4 starts at 15.2 s

  assert.deepEqual(plays, [
    { translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: at(22.04) },
  ]);
  assert.deepEqual(followed, ['JHN 4 -> JHN 3']);
  assert.deepEqual(player.seeks, []);
});

test('an end verse that is the chapter last runs to the chapter end, then loops', async () => {
  repeating(passage('JHN', [3, 5], [3, 6]));
  loaded('JHN', 3, 45_000);
  await progress(46_000);
  await progress(47_000);
  await progress(290_000);
  assert.deepEqual(player.seeks, []);

  await finish();
  assert.deepEqual(plays, [
    { translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: at(37.64) },
  ]);
});

test('without verse timings the passage rounds out to whole chapters', async () => {
  repeating(passage('JHN', [3, 3], [4, 2]));
  loaded('JHN', 3, 0, 'playing', 'webbe');
  await progress(15_000);
  await progress(16_000);
  assert.deepEqual(player.seeks, []);

  await finish(); // John 3 → John 4
  await progress(10_000);
  await progress(20_000);
  assert.deepEqual(player.seeks, [], 'no mid-chapter end without timings');
  await finish(); // John 4 → back to the top of John 3

  assert.deepEqual(plays, [
    { translationId: 'webbe', bookId: 'JHN', chapter: 4, startPositionMs: 0 },
    { translationId: 'webbe', bookId: 'JHN', chapter: 3, startPositionMs: 0 },
  ]);
});

test('sparse coverage walks only the passage chapters that have audio', async () => {
  coverage = { PSA: [23, 117, 119] };
  repeating(passage('PSA', [116, 1], [119, 176]));
  loaded('PSA', 117, 0, 'playing', 'el-sample');

  await finish();
  await finish();

  assert.deepEqual(
    plays.map(({ chapter }) => chapter),
    [119, 117]
  );
});

test('a chapter outside the passage plays to its end, then returns to the passage', async () => {
  repeating(passage('JHN', [3, 3], [3, 4]));
  loaded('MRK', 1, 100_000);
  await progress(101_000);

  await finish();

  assert.deepEqual(plays, [
    { translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: at(22.04) },
  ]);
});

test('a plan session still owns playback through its chapters', async () => {
  repeating(passage('JHN', [3, 3], [3, 4]));
  useAudioStore.setState({
    playbackSequence: [
      { bookId: 'JHN', chapter: 3 },
      { bookId: 'JHN', chapter: 4 },
    ],
  });
  loaded('JHN', 3, 36_000);
  await progress(36_500);
  await progress(37_500);
  await progress(38_500);
  assert.deepEqual(player.seeks, [], 'the end verse is not watched in a plan chapter');

  await finish();
  assert.deepEqual(plays, [
    { translationId: 'bsb', bookId: 'JHN', chapter: 4, startPositionMs: 0 },
  ]);
});

test('passage repeat comes before the queue', async () => {
  repeating(passage('JHN', [3, 1], [3, 36]));
  useAudioStore.getState().addToQueue('bsb', 'GEN', 1);
  loaded('JHN', 3, 280_000);

  await finish();

  assert.deepEqual(
    plays.map(({ bookId, chapter }) => `${bookId} ${chapter}`),
    ['JHN 3']
  );
});

test('a passage with no audio in this translation falls through to auto-advance', async () => {
  coverage = { PSA: [23] };
  repeating(passage('PSA', [116, 1], [118, 29]));
  loaded('PSA', 23, 0, 'playing', 'el-sample');

  await finish();

  assert.deepEqual(
    plays.map(({ chapter }) => chapter),
    [24]
  );
});

test('the finish handler plays no passage when repeat is not passage', async () => {
  useAudioStore.setState({ repeatPassage: passage('JHN', [3, 3], [3, 4]), repeatMode: 'off' });
  loaded('JHN', 3, 0);

  await finish();

  assert.deepEqual(
    plays.map(({ chapter }) => chapter),
    [4]
  );
});

// --- setting the passage ----------------------------------------------------------

function following(): void {
  passageRepeat.followRepeatPassage(context());
}

async function setPassage(value: RepeatPassage): Promise<void> {
  following();
  useAudioStore.getState().setRepeatPassage(value);
  await passageRepeat.passageRepeatSettled();
}

test('setting a passage while another chapter plays moves playback to the start verse', async () => {
  loaded('JHN', 1, 50_000);

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(plays, [
    { translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: at(22.04) },
  ]);
  assert.deepEqual(followed, [], 'a listener choice, not audio moving on by itself');
});

test('setting a passage in another book switches to it', async () => {
  loaded('GEN', 1, 50_000);

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(plays, [
    { translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: at(22.04) },
  ]);
});

test('setting a passage that playback is already inside leaves it alone', async () => {
  loaded('JHN', 3, 25_000);

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(plays, []);
  assert.deepEqual(player.seeks, []);
});

test('setting a passage later in the playing chapter seeks to its start verse', async () => {
  loaded('JHN', 3, 5_000);

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(player.seeks, [at(22.04)]);
  assert.deepEqual(plays, []);
  assert.equal(track().status, 'playing');
});

test('setting a passage earlier in the playing chapter seeks back to its start verse', async () => {
  loaded('JHN', 3, 45_000);

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(player.seeks, [at(22.04)]);
});

test('changing the passage re-engages it', async () => {
  loaded('JHN', 3, 25_000);
  await setPassage(passage('JHN', [3, 3], [3, 4]));
  assert.deepEqual(player.seeks, []);

  await setPassage(passage('JHN', [3, 5], [3, 6]));

  assert.deepEqual(player.seeks, [at(37.64)]);
});

test('without timings, any point of a passage chapter is inside it', async () => {
  loaded('JHN', 3, 5_000, 'playing', 'webbe');

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(player.seeks, []);
  assert.deepEqual(plays, []);
});

test('setting a passage while another chapter is paused cues its start for Play', async () => {
  loaded('JHN', 1, 50_000, 'paused');

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(plays, [], 'nothing starts playing');
  assert.equal(player.stops, 1);
  assert.deepEqual(track(), {
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    positionMs: at(22.04),
    status: 'paused',
  });
  assert.deepEqual(
    resolvePlaybackStart(useAudioStore.getState(), 'bsb', () => player.loaded),
    {
      kind: 'play',
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      startPositionMs: at(22.04),
    }
  );
});

test('setting a passage while the same chapter is paused moves the paused position', async () => {
  loaded('JHN', 3, 5_000, 'paused');

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(player.seeks, [at(22.04)]);
  assert.equal(track().status, 'paused');
  assert.equal(player.loaded, true);
});

test('a command while the passage decision waits wins', async () => {
  loaded('JHN', 1, 50_000);
  following();
  useAudioStore.getState().setRepeatPassage(passage('JHN', [3, 3], [3, 4]));
  // The listener picks another chapter before the timings have loaded.
  await session.playChapterForTranslation?.('bsb', 'MRK', 2);
  await passageRepeat.passageRepeatSettled();

  assert.deepEqual(
    plays.map(({ bookId, chapter }) => `${bookId} ${chapter}`),
    ['MRK 2']
  );
});

test('with nothing loaded, setting a passage waits for Play, which starts at the passage', async () => {
  await setPassage(passage('JHN', [3, 3], [3, 4]));
  assert.deepEqual(plays, []);
  assert.deepEqual(timingRequests, ['bsb/JHN/3'], 'the start verse time is fetched ahead of Play');

  const ctx = context();
  assert.equal(passageRepeat.isPassagePlayRedirectPending(ctx), true);
  const request = { translationId: 'bsb', bookId: 'GEN', chapter: 1, startPositionMs: 0 };
  assert.deepEqual(await passageRepeat.redirectPlayToPassage(ctx, request), {
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    startPositionMs: at(22.04),
  });

  // Only the first Play.
  assert.equal(passageRepeat.isPassagePlayRedirectPending(ctx), false);
  assert.equal(await passageRepeat.redirectPlayToPassage(ctx, request), request);
});

test('a first Play already inside the passage is left as it is', async () => {
  await setPassage(passage('JHN', [3, 3], [3, 4]));
  const request = { translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: 25_000 };

  assert.equal(await passageRepeat.redirectPlayToPassage(context(), request), request);
});

test('a first Play at the top of the start chapter starts at the start verse', async () => {
  await setPassage(passage('JHN', [3, 3], [3, 4]));
  const request = { translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: 0 };

  assert.deepEqual(await passageRepeat.redirectPlayToPassage(context(), request), {
    ...request,
    startPositionMs: at(22.04),
  });
});

test('another command before Play cancels the pending passage start', async () => {
  await setPassage(passage('JHN', [3, 3], [3, 4]));
  await session.playChapterForTranslation?.('bsb', 'MRK', 2);
  useAudioStore.getState().setStatus('paused');

  assert.equal(passageRepeat.isPassagePlayRedirectPending(context()), false);
});

test('switching repeat off cancels the pending passage start', async () => {
  await setPassage(passage('JHN', [3, 3], [3, 4]));
  useAudioStore.getState().setRepeatMode('off');

  assert.equal(passageRepeat.isPassagePlayRedirectPending(context()), false);
});

test('an idle player after a finished chapter also waits for Play', async () => {
  loaded('GEN', 50, 0);
  useAudioStore.getState().setStatus('idle');

  await setPassage(passage('JHN', [3, 3], [3, 4]));

  assert.deepEqual(plays, []);
  assert.equal(passageRepeat.isPassagePlayRedirectPending(context()), true);
});

test('a passage past the end of its book clamps to the book', async () => {
  repeating(passage('JUD', [1, 20], [3, 1]));
  loaded('JUD', 1, 0, 'playing', 'webbe');

  await finish();

  assert.deepEqual(plays, [
    { translationId: 'webbe', bookId: 'JUD', chapter: 1, startPositionMs: 0 },
  ]);
});
