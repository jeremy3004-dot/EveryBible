/**
 * The music bed and the narration volume follow the real audio store, with the reader
 * closed as much as open. The players are doubles that record what they were told.
 */
import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import type { BackgroundMusicChoice } from '../../types';

const mmkv = mockMmkvStorage(mock);

const recorded = {
  bed: [] as { choice: string; shouldPlay: boolean }[],
  bedStops: 0,
  levels: [] as number[],
  voice: [] as number[],
};
let candidates: BackgroundMusicChoice[] = ['piano', 'harp', 'ocean-waves'];

mockModule(mock, sourcePath('services/audio/index.ts'), {
  backgroundMusicPlayer: {
    sync: async (choice: string, shouldPlay: boolean) => {
      recorded.bed.push({ choice, shouldPlay });
    },
    stop: async () => {
      recorded.bedStops += 1;
    },
    setLevel: (level: number) => {
      recorded.levels.push(level);
    },
    getShuffleCandidates: () => candidates,
  },
  audioPlayer: {
    isLoaded: () => false,
    setVolume: async (volume: number) => {
      recorded.voice.push(volume);
    },
  },
});

let useAudioStore: (typeof import('../../stores/audioStore'))['useAudioStore'];
let chapterTransition: (typeof import('./sharedPlaybackState'))['chapterTransition'];

const store = () => useAudioStore.getState();
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const clearRecordings = () => {
  recorded.bed.length = 0;
  recorded.bedStops = 0;
  recorded.levels.length = 0;
  recorded.voice.length = 0;
};

/** What starting a chapter does to the store: the status, then the chapter. */
async function startChapter(bookId: string, chapter: number): Promise<void> {
  store().setStatus('loading');
  store().setCurrentTrack('bsb', bookId, chapter);
  store().setStatus('playing');
  await settle();
}

const picks = () => recorded.bed.filter((call) => call.shouldPlay).map((call) => call.choice);

before(async () => {
  ({ useAudioStore } = await import('../../stores/audioStore'));
  ({ chapterTransition } = await import('./sharedPlaybackState'));
  const { followPlaybackWithBackgroundMusic } = await import('./backgroundMusicFollow');
  const { followNarrationVolume } = await import('./narrationVolumeFollow');
  followPlaybackWithBackgroundMusic();
  followNarrationVolume();
});

beforeEach(async () => {
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  mmkv.store.clear();
  chapterTransition.current = false;
  candidates = ['piano', 'harp', 'ocean-waves'];
  await settle();
  clearRecordings();
});

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

test('a Sound level change reaches the bed without resyncing it', () => {
  store().setBackgroundMusicLevel(0.8);

  assert.deepEqual(recorded.levels, [0.8]);
  assert.deepEqual(recorded.bed, []);
});

test('a Voice level change reaches the narration player at once', () => {
  store().setNarrationVolume(0.35);

  assert.deepEqual(recorded.voice, [0.35]);
});

test('unrelated store changes leave both levels alone', () => {
  store().setPosition(12_000);
  store().setPlaybackRate(1.5);

  assert.deepEqual(recorded.levels, []);
  assert.deepEqual(recorded.voice, []);
});

test('a player mounting applies the stored levels', async () => {
  store().setBackgroundMusicLevel(0.2);
  store().setNarrationVolume(0.6);
  clearRecordings();
  const { followPlaybackWithBackgroundMusic } = await import('./backgroundMusicFollow');
  const { followNarrationVolume } = await import('./narrationVolumeFollow');

  followPlaybackWithBackgroundMusic();
  followNarrationVolume();

  assert.deepEqual(recorded.levels, [0.2]);
  assert.deepEqual(recorded.voice, [0.6]);
});

// ---------------------------------------------------------------------------
// Shuffle
// ---------------------------------------------------------------------------

test('Shuffle plays one real sound for the chapter, and the stored choice stays shuffle', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  store().setBackgroundMusicChoice('shuffle');

  await startChapter('GEN', 1);

  assert.equal(picks().length, 1, 'one pick when a session starts, not one per store change');
  assert.equal(candidates.includes(picks()[0] as BackgroundMusicChoice), true);
  assert.equal(store().backgroundMusicChoice, 'shuffle');
});

test('each new chapter crossfades to a different sound', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  store().setBackgroundMusicChoice('shuffle');
  await startChapter('GEN', 1);

  // Auto-advance: the bed plays through the change of chapter.
  chapterTransition.current = true;
  await startChapter('GEN', 2);
  chapterTransition.current = true;
  await startChapter('GEN', 3);

  const heard = picks().filter((choice, index, all) => choice !== all[index - 1]);
  assert.equal(heard.length, 3);
  assert.notEqual(heard[1], heard[0]);
  assert.notEqual(heard[2], heard[1]);
  assert.equal(
    recorded.bed.some((call) => !call.shouldPlay),
    false,
    'no pause between chapters'
  );
});

test('a pause and resume keeps the same sound', async (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  store().setBackgroundMusicChoice('shuffle');
  await startChapter('GEN', 1);
  const [sound] = picks();

  store().setStatus('paused');
  await settle();
  store().setStatus('playing');
  await settle();

  assert.deepEqual(recorded.bed.slice(1), [
    { choice: sound, shouldPlay: false },
    { choice: sound, shouldPlay: true },
  ]);
});

test('the next listening session starts with a new sound, even on the same chapter', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  store().setBackgroundMusicChoice('shuffle');
  await startChapter('GEN', 1);
  const [first] = picks();

  store().setStatus('idle');
  await settle();
  await startChapter('GEN', 1);

  const [, second] = picks();
  assert.deepEqual(recorded.bed[1], { choice: first, shouldPlay: false });
  assert.notEqual(second, first);
});

test('with a single playable sound Shuffle keeps playing it', async (t) => {
  t.mock.method(Math, 'random', () => 0.9);
  candidates = ['harp'];
  store().setBackgroundMusicChoice('shuffle');

  await startChapter('GEN', 1);
  chapterTransition.current = true;
  await startChapter('GEN', 2);

  assert.deepEqual([...new Set(picks())], ['harp']);
});

test('choosing a fixed sound after Shuffle plays that sound', async () => {
  store().setBackgroundMusicChoice('shuffle');
  await startChapter('GEN', 1);

  store().setBackgroundMusicChoice('sitar');
  await settle();

  assert.deepEqual(recorded.bed.at(-1), { choice: 'sitar', shouldPlay: true });
});

test('a chapter change with a fixed sound does not resync the bed', async () => {
  store().setBackgroundMusicChoice('piano');
  await startChapter('GEN', 1);
  const syncs = recorded.bed.length;

  store().setCurrentTrack('bsb', 'GEN', 2);
  await settle();

  assert.equal(recorded.bed.length, syncs);
});

// ---------------------------------------------------------------------------
// Selah
// ---------------------------------------------------------------------------

/** Selah as the engine carries it out: the flag, then the narration's pause. */
async function holdInSelah(): Promise<void> {
  store().setSelahActive(true);
  store().setStatus('paused');
  await settle();
}

test('Selah holding the narration paused keeps the bed playing', async () => {
  store().setBackgroundMusicChoice('piano');
  await startChapter('GEN', 1);
  const syncsBefore = recorded.bed.length;

  await holdInSelah();

  assert.deepEqual(recorded.bed.at(-1), { choice: 'piano', shouldPlay: true });
  assert.equal(
    recorded.bed.slice(syncsBefore).some((call) => !call.shouldPlay),
    false,
    'the bed never dips as the narration pauses'
  );
});

test('Selah ending with the narration still paused pauses the bed with it', async () => {
  store().setBackgroundMusicChoice('piano');
  await startChapter('GEN', 1);
  await holdInSelah();

  store().setSelahActive(false);
  await settle();

  assert.deepEqual(recorded.bed.at(-1), { choice: 'piano', shouldPlay: false });
});

test('Selah over a paused chapter starts the bed, and Shuffle keeps its sound', async (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  store().setBackgroundMusicChoice('shuffle');
  await startChapter('GEN', 1);
  const [sound] = picks();
  store().setStatus('paused');
  await settle();

  store().setSelahActive(true);
  await settle();

  assert.deepEqual(recorded.bed.at(-1), { choice: sound, shouldPlay: true });
});

test('stopping playback during Selah stops the bed', async () => {
  store().setBackgroundMusicChoice('piano');
  await startChapter('GEN', 1);
  await holdInSelah();

  store().resetPlayback();
  await settle();

  assert.deepEqual(recorded.bed.at(-1), { choice: 'piano', shouldPlay: false });
});
