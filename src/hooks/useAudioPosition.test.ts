import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { before, beforeEach, mock } from 'node:test';
import { shallow } from 'zustand/shallow';
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

// zustand re-renders a useShallow consumer only when `shallow` sees a change, so
// these run the hook's registered selector the way the store does.
const registeredSelector = (track?: typeof JOHN_3) => {
  mod.useAudioPosition(track);
  const selector = shallowWrapped.at(-1) as (slice: AudioSlice) => Record<string, number>;
  assert.equal(typeof selector, 'function');
  return () => selector(state);
};

test('a reader on another chapter is not re-rendered by any of 240 playback ticks', () => {
  const read = registeredSelector({ translationId: 'bsb', bookId: 'JHN', chapter: 4 });
  const initial = read();
  let updates = 0;
  for (let position = 250; position <= 60_000; position += 250) {
    state = { ...state, currentPosition: position };
    if (!shallow(initial, read())) updates += 1;
  }
  assert.equal(updates, 0);
});

test('the playing chapter keeps exact progress through backward seeks and duration fixes', () => {
  const read = registeredSelector(JOHN_3);
  for (const position of [250, 60_123, 5_123]) {
    state = { ...state, currentPosition: position, duration: 100_001 };
    assert.deepEqual(read(), { currentPosition: position, duration: 100_001 });
  }
  state = { ...state, currentTranslationId: 'web' };
  assert.deepEqual(read(), { currentPosition: 0, duration: 0 });
  state = { ...state, currentTranslationId: 'bsb' };
  assert.deepEqual(read(), { currentPosition: 5_123, duration: 100_001 });
});

test('an unscoped consumer follows every live position tick', () => {
  const read = registeredSelector();
  state = { ...state, currentPosition: 45_678 };
  assert.deepEqual(read(), { currentPosition: 45_678, duration: 90_000 });
});
