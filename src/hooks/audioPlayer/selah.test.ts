/**
 * Selah against the real audio store, the real Pause and Resume, the music bed and Voice
 * followers, with the native players faked as recorders. Time is the mock clock, so the
 * fades and the 30-minute hold run instantly.
 */
import test, { before, beforeEach, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import type { BibleNowPlayingInput } from '../../services/audio/audioNowPlayingModel';
import { assertDefined } from '../../utils/assertDefined';
import type { AudioPlayerSession } from './playerSession';

mockMmkvStorage(mock);
mockReactNative(mock, { os: 'ios' });

// --- the native players -----------------------------------------------------------
const calls: string[] = [];
const bed: string[] = [];
const player = { loaded: true };
mockModule(mock, sourcePath('services/audio/index.ts'), {
  audioPlayer: {
    isLoaded: () => player.loaded,
    pause: async () => void calls.push('pause'),
    resume: async () => void calls.push('resume'),
    seekTo: async (positionMs: number) => void calls.push(`seek ${positionMs}`),
    setVolume: async (volume: number) => void calls.push(`volume ${round(volume)}`),
    stop: async () => void calls.push('stop'),
  },
  backgroundMusicPlayer: {
    sync: async (choice: string, shouldPlay: boolean) =>
      void bed.push(`${choice} ${shouldPlay ? 'plays' : 'paused'}`),
    stop: async () => void bed.push('stop'),
    setLevel: () => {},
    fadeOut: (durationMs: number) => void bed.push(`fade out ${durationMs}`),
    getShuffleCandidates: () => ['piano'],
  },
  clearBibleNowPlaying: async () => {},
});

// BSB John 3 has verse timings (seconds); nothing else does.
const JOHN_3 = { 1: 0.4, 2: 10, 3: 30 };
mockModule(mock, sourcePath('services/bible/verseTimestamps.ts'), {
  getChapterTimestamps: async (translationId: string, bookId: string, chapter: number) =>
    translationId === 'bsb' && bookId === 'JHN' && chapter === 3 ? JOHN_3 : null,
});

mockModule(mock, sourcePath('hooks/audioPlayer/readingPositionFollow.ts'), {
  followAutoAdvancedChapter: () => {},
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

const round = (value: number) => Math.round(value * 1000) / 1000;

type Selah = typeof import('./selah');
let selah: Selah;
let useAudioStore: (typeof import('../../stores/audioStore'))['useAudioStore'];
let passageRepeat: typeof import('./passageRepeat');

const nowPlaying: Partial<BibleNowPlayingInput>[] = [];
const session: AudioPlayerSession = {
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
  playChapterForTranslation: null,
};

before(async () => {
  selah = await import('./selah');
  passageRepeat = await import('./passageRepeat');
  ({ useAudioStore } = await import('../../stores/audioStore'));
  const transport = await import('./transportControls');
  const context = {
    session,
    fallbackTranslationId: 'bsb',
    syncNowPlaying: (overrides: Partial<BibleNowPlayingInput> = {}) =>
      void nowPlaying.push(overrides),
  };
  const pause = () => transport.pausePlayback(context);
  selah.provideSelahTransport({
    holdNarration: () => transport.pausePlayback(context, { holdForSelah: true }),
    pause,
    resume: () =>
      transport.resumePlayback({
        ...context,
        playChapterForTranslation: async () => {},
      }),
  });
  const { followPlaybackWithBackgroundMusic } = await import('./backgroundMusicFollow');
  const { followNarrationVolume } = await import('./narrationVolumeFollow');
  followPlaybackWithBackgroundMusic();
  followNarrationVolume();
});

const store = () => useAudioStore.getState();
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
};
const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

beforeEach(async () => {
  selah.resetSelahState();
  passageRepeat.resetPassageRepeatState();
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  player.loaded = true;
  await settle();
  calls.length = 0;
  bed.length = 0;
  nowPlaying.length = 0;
});

/** John 3 (with timings) or 4 playing at `positionMs`, the Voice at 0.8, piano on. */
async function playing(t: TestContext, positionMs: number, chapter = 4): Promise<void> {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: NOW });
  store().setBackgroundMusicChoice('piano');
  store().setNarrationVolume(0.8);
  store().setCurrentTrack('bsb', 'JHN', chapter);
  store().setDuration(300_000);
  store().setStatus('playing');
  store().setPosition(positionMs);
  await settle();
  calls.length = 0;
  bed.length = 0;
  nowPlaying.length = 0;
}

/** Selah on, its fade run to the end, and the narration's pause done. */
async function holdInSelah(t: TestContext): Promise<void> {
  const entering = selah.toggleSelah();
  t.mock.timers.tick(750);
  await entering;
  await settle();
}

async function resumeFromSelah(t: TestContext): Promise<void> {
  const leaving = selah.toggleSelah();
  await settle();
  t.mock.timers.tick(750);
  await leaving;
  await settle();
}

const volumes = () =>
  calls.filter((call) => call.startsWith('volume')).map((call) => Number(call.slice(7)));

// --- going into Selah ---------------------------------------------------------------

test('Selah fades the narration out, pauses it, and keeps the music playing', async (t) => {
  await playing(t, 42_000);

  const entering = selah.toggleSelah();
  assert.equal(store().selahActive, true, 'on at once, while the fade runs');
  t.mock.timers.tick(750);
  await entering;
  await settle();

  const fade = volumes().slice(0, 15);
  assert.equal(fade.length, 15);
  const first = assertDefined(fade[0], 'first fade step');
  assert.equal(first < 0.8 && first > 0.7, true);
  assert.equal(fade.at(-1), 0);
  assert.deepEqual(calls.slice(15), ['pause', 'volume 0.8']);
  assert.equal(store().status, 'paused');
  assert.equal(store().selahActive, true);
  assert.deepEqual(
    bed.filter((call) => !call.endsWith('plays')),
    [],
    'the bed was never told to pause'
  );
});

test('the lock screen shows the narration as paused during Selah', async (t) => {
  await playing(t, 42_000);

  await holdInSelah(t);

  assert.equal(nowPlaying.at(-1)?.isPlaying, false);
});

test('Selah over a paused chapter starts the music and leaves the narration paused', async (t) => {
  await playing(t, 42_000);
  store().setStatus('paused');
  await settle();
  bed.length = 0;

  await selah.toggleSelah();
  await settle();

  assert.equal(store().selahActive, true);
  assert.deepEqual(calls, []);
  assert.deepEqual(bed, ['piano plays']);
});

test('Selah is a no-op with the background sound off or nothing loaded', async (t) => {
  await playing(t, 42_000);
  store().setBackgroundMusicChoice('off');
  await selah.toggleSelah();
  t.mock.timers.tick(750);
  store().setBackgroundMusicChoice('piano');
  store().resetPlayback();
  await selah.toggleSelah();
  t.mock.timers.tick(750);
  await settle();

  assert.equal(store().selahActive, false);
  assert.deepEqual(
    calls.filter((call) => call === 'pause'),
    []
  );
});

// --- coming out of it ---------------------------------------------------------------

test('Selah again picks up 1.5 s earlier and fades the narration back in', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);
  calls.length = 0;

  await resumeFromSelah(t);

  assert.deepEqual(calls.slice(0, 3), ['volume 0', 'seek 40500', 'resume']);
  const fadeIn = volumes().slice(1);
  assert.equal(fadeIn.length, 15);
  assert.equal(fadeIn.at(-1), 0.8);
  assert.equal(store().status, 'playing');
  assert.equal(store().selahActive, false);
  assert.equal(store().currentPosition, 40_500);
});

test('with verse timings the narration picks up at the start of its verse', async (t) => {
  await playing(t, 14_000, 3);
  await holdInSelah(t);
  calls.length = 0;

  await resumeFromSelah(t);

  // Verse 2 starts at 10 s, read 150 ms early.
  assert.equal(calls[1], 'seek 9850');
});

test('a Voice change while the narration fades back in is where the fade ends', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);
  const leaving = selah.toggleSelah();
  await settle();
  t.mock.timers.tick(300);
  store().setNarrationVolume(0.5);
  t.mock.timers.tick(450);
  await leaving;

  assert.equal(volumes().at(-1), 0.5);
  assert.equal(
    volumes().every((volume) => volume <= 0.8),
    true
  );
});

test('Selah again while it is still fading out brings the narration back without a pause', async (t) => {
  await playing(t, 42_000);
  const entering = selah.toggleSelah();
  t.mock.timers.tick(300);

  const leaving = selah.toggleSelah();
  t.mock.timers.tick(750);
  await Promise.all([entering, leaving]);
  await settle();

  assert.equal(store().selahActive, false);
  assert.equal(store().status, 'playing');
  assert.equal(calls.includes('pause'), false);
  assert.equal(
    calls.some((call) => call.startsWith('seek')),
    false
  );
  assert.equal(volumes().at(-1), 0.8);
});

test('switching the background sound to Off during Selah resumes the reading', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);
  calls.length = 0;

  store().setBackgroundMusicChoice('off');
  await settle();
  t.mock.timers.tick(750);
  await settle();

  assert.deepEqual(calls.slice(0, 3), ['volume 0', 'seek 40500', 'resume']);
  assert.equal(store().selahActive, false);
  assert.equal(store().status, 'playing');
});

// --- a normal Pause, and everything else that ends it --------------------------------

test('a normal Pause during Selah ends it and pauses the music too', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);

  const { pausePlayback } = await import('./transportControls');
  await pausePlayback({ session, fallbackTranslationId: 'bsb', syncNowPlaying: () => {} });
  await settle();

  assert.equal(store().selahActive, false);
  assert.equal(store().status, 'paused');
  assert.deepEqual(bed.at(-1), 'piano paused');
});

test('Pause while Selah is fading out pauses first, then puts the Voice level back', async (t) => {
  await playing(t, 42_000);
  void selah.toggleSelah();
  t.mock.timers.tick(300);
  const { pausePlayback } = await import('./transportControls');
  calls.length = 0;

  await pausePlayback({ session, fallbackTranslationId: 'bsb', syncNowPlaying: () => {} });
  t.mock.timers.tick(750);
  await settle();

  assert.deepEqual(calls, ['pause', 'volume 0.8']);
  assert.equal(store().selahActive, false);
  assert.equal(bed.at(-1), 'piano paused');
});

test('selecting another chapter ends Selah and leaves the narration at the Voice level', async (t) => {
  await playing(t, 42_000);
  void selah.toggleSelah();
  t.mock.timers.tick(300);

  store().setStatus('loading');
  store().setCurrentTrack('bsb', 'JHN', 5);
  t.mock.timers.tick(30 * MINUTE);
  await settle();

  assert.equal(store().selahActive, false);
  assert.equal(volumes().at(-1), 0.8);
  assert.equal(calls.includes('pause'), false, 'the fade stood down; no pause followed');
  assert.equal(bed.includes('fade out 3000'), false, 'no hold limit left running');
});

test('stopping during Selah ends it and the music with it', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);

  store().resetPlayback();
  await settle();

  assert.equal(store().selahActive, false);
  assert.equal(bed.at(-1), 'piano paused');
});

// --- the limits -----------------------------------------------------------------------

test('after 30 minutes in Selah the music fades out and playback pauses', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);

  t.mock.timers.tick(30 * MINUTE - 750);
  await settle();
  assert.deepEqual(
    bed.filter((call) => !call.endsWith('plays')),
    ['fade out 3000']
  );
  assert.equal(store().selahActive, true, 'still on while the music fades');

  t.mock.timers.tick(3000);
  await settle();
  assert.equal(store().selahActive, false);
  assert.equal(store().status, 'paused');
  assert.equal(bed.at(-1), 'piano paused');
});

test('the sleep timer keeps counting in Selah and ends everything when it runs out', async (t) => {
  await playing(t, 42_000);
  store().setSleepTimer(5);
  await holdInSelah(t);

  t.mock.timers.tick(5 * MINUTE);
  await settle();

  assert.equal(store().selahActive, false);
  assert.equal(store().sleepTimerMinutes, null);
  assert.equal(store().status, 'paused');
  assert.equal(bed.at(-1), 'piano paused');
});

test('a Selah ended early does not leave its hold limit behind', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);
  await resumeFromSelah(t);
  bed.length = 0;

  t.mock.timers.tick(31 * MINUTE);
  await settle();

  assert.deepEqual(bed, []);
  assert.equal(store().status, 'playing');
});

// --- passage repeat -------------------------------------------------------------------

const snapshotAt = (positionMillis: number) => ({
  isLoaded: true as const,
  positionMillis,
  durationMillis: 300_000,
  isPlaying: true,
  isBuffering: false,
  didJustFinish: false,
});

test('a passage loop due after the fade is cancelled by the Selah pause', async (t) => {
  await playing(t, 28_500, 3);
  store().setRepeatPassage({
    bookId: 'JHN',
    start: { chapter: 3, verse: 1 },
    end: { chapter: 3, verse: 2 },
  });
  const ctx = {
    session,
    fallbackTranslationId: 'bsb',
    resolveAudioCoverage: async () => undefined,
  };
  passageRepeat.watchPassageProgress(ctx, snapshotAt(28_000));
  await passageRepeat.passageRepeatSettled();
  passageRepeat.watchPassageProgress(ctx, snapshotAt(28_000));
  // Verse 2 ends 1.35 s from here (verse 3 at 30 s, read 150 ms early): the loop is timed.
  passageRepeat.watchPassageProgress(ctx, snapshotAt(28_500));
  calls.length = 0;

  await holdInSelah(t);
  t.mock.timers.tick(2_000);
  await passageRepeat.passageRepeatSettled();

  assert.equal(
    calls.some((call) => call.startsWith('seek')),
    false
  );
  assert.equal(store().selahActive, true);
  assert.equal(store().currentPosition, 28_500);
});

test('the music plays straight through a Selah resume', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);
  bed.length = 0;

  await resumeFromSelah(t);

  assert.deepEqual(
    bed.filter((call) => !call.endsWith('plays')),
    []
  );
});

test('two resumes of one Selah pick up at the same place', async (t) => {
  await playing(t, 42_000);
  await holdInSelah(t);
  calls.length = 0;
  const { resumePlayback } = await import('./transportControls');
  const context = {
    session,
    fallbackTranslationId: 'bsb',
    syncNowPlaying: () => {},
    playChapterForTranslation: async () => {},
  };

  await Promise.all([resumePlayback(context), resumePlayback(context)]);
  t.mock.timers.tick(750);
  await settle();

  assert.deepEqual(
    calls.filter((call) => call.startsWith('seek')),
    ['seek 40500', 'seek 40500']
  );
  assert.equal(store().selahActive, false);
  assert.equal(store().status, 'playing');
  assert.equal(volumes().at(-1), 0.8);
});
