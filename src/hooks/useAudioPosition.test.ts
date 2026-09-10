import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../testing/mockModules';

// ---------------------------------------------------------------------------
// Store + shallow-selector doubles
//
// There is no React renderer here, so `useAudioStore` simply runs the selector
// it is handed against a mutable state object, and `useShallow` is the identity
// wrapper (its memoisation is zustand's, not this hook's).
// ---------------------------------------------------------------------------

interface AudioSlice {
  currentTranslationId: string | null;
  currentBookId: string | null;
  currentChapter: number | null;
  currentPosition: number;
  duration: number;
}

let state: AudioSlice = {
  currentTranslationId: 'bsb',
  currentBookId: 'JHN',
  currentChapter: 3,
  currentPosition: 45_000,
  duration: 90_000,
};

const shallowWrapped: unknown[] = [];

// zustand's exports map resolves this subpath to a CJS file under Node; mock the
// resolved path so the hook's own import is intercepted.
mockModule(mock, createRequire(import.meta.url).resolve('zustand/react/shallow'), {
  useShallow: (selector: unknown) => {
    shallowWrapped.push(selector);
    return selector;
  },
});

mockModule(mock, sourcePath('stores/audioStore.ts'), {
  useAudioStore: Object.assign((selector: (slice: AudioSlice) => unknown) => selector(state), {
    getState: () => state,
  }),
});

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type UseAudioPositionModule = typeof import('./useAudioPosition');

let mod: UseAudioPositionModule;

const JOHN_3 = { translationId: 'bsb', bookId: 'JHN', chapter: 3 };

before(async () => {
  mod = await import('./useAudioPosition');
});

beforeEach(() => {
  state = {
    currentTranslationId: 'bsb',
    currentBookId: 'JHN',
    currentChapter: 3,
    currentPosition: 45_000,
    duration: 90_000,
  };
  shallowWrapped.length = 0;
});

test('an unscoped consumer always sees the live playback position', () => {
  assert.deepEqual(mod.useAudioPosition(), { currentPosition: 45_000, duration: 90_000 });
});

test('a consumer scoped to the playing chapter sees the live playback position', () => {
  assert.deepEqual(mod.useAudioPosition(JOHN_3), {
    currentPosition: 45_000,
    duration: 90_000,
  });
});

test('a reader showing another book paints no progress', () => {
  assert.deepEqual(mod.useAudioPosition({ ...JOHN_3, bookId: 'GEN' }), {
    currentPosition: 0,
    duration: 0,
  });
});

test('a reader showing another chapter of the same book paints no progress', () => {
  assert.deepEqual(mod.useAudioPosition({ ...JOHN_3, chapter: 4 }), {
    currentPosition: 0,
    duration: 0,
  });
});

test('a reader showing another translation paints no progress', () => {
  assert.deepEqual(mod.useAudioPosition({ ...JOHN_3, translationId: 'web' }), {
    currentPosition: 0,
    duration: 0,
  });
});

test('audio with an unknown translation still matches the reader on book and chapter', () => {
  state.currentTranslationId = null;

  assert.deepEqual(mod.useAudioPosition({ ...JOHN_3, translationId: 'web' }), {
    currentPosition: 45_000,
    duration: 90_000,
  });
});

test('a track that has not started yet reports a zero position', () => {
  state.currentPosition = 0;
  state.duration = 0;

  assert.deepEqual(mod.useAudioPosition(JOHN_3), { currentPosition: 0, duration: 0 });
});

test('nothing playing at all leaves a scoped reader with no progress', () => {
  state.currentBookId = null;
  state.currentChapter = null;

  assert.deepEqual(mod.useAudioPosition(JOHN_3), { currentPosition: 0, duration: 0 });
});

test('the selector is registered through useShallow so ticks do not re-render consumers', () => {
  mod.useAudioPosition(JOHN_3);

  assert.equal(shallowWrapped.length, 1);
  assert.equal(typeof shallowWrapped[0], 'function');
});
