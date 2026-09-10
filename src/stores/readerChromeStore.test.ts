import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from '../testing/mockModules';

// readerChromeStore holds reanimated shared values, so `makeMutable` is replaced
// with a plain `{ value }` box. Local helper: it also records every box it made,
// which is how the tests below prove the two chrome slots are distinct mutables
// created once at module scope rather than per hook call.
const madeMutables: Array<{ value: unknown }> = [];
mockModule(mock, 'react-native-reanimated', {
  makeMutable: (initial: unknown) => {
    const mutable = { value: initial };
    madeMutables.push(mutable);
    return mutable;
  },
});

// Zustand's React binding only needs these three hooks. Identity implementations
// make the selector hooks callable outside a renderer.
const reactStub = {
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useCallback: <T>(callback: T) => callback,
  useDebugValue: () => {},
};
mockModule(mock, 'react', { ...reactStub, default: reactStub });

let useReaderChromeProgress: typeof import('./readerChromeStore').useReaderChromeProgress;
let useReaderChromeOwner: typeof import('./readerChromeStore').useReaderChromeOwner;

before(async () => {
  ({ useReaderChromeProgress, useReaderChromeOwner } = await import('./readerChromeStore'));
});

test('the chrome store creates exactly two shared values at module scope', () => {
  assert.equal(madeMutables.length, 2);
  assert.deepEqual(
    madeMutables.map((mutable) => mutable.value),
    [0, '']
  );
});

test('reader chrome progress starts at zero', () => {
  assert.equal(useReaderChromeProgress().value, 0);
});

test('reader chrome owner starts as the empty key', () => {
  assert.equal(useReaderChromeOwner().value, '');
});

test('progress and owner are separate shared values, not the same box', () => {
  assert.notEqual(useReaderChromeProgress() as unknown, useReaderChromeOwner() as unknown);
});

test('every read returns the same shared value so writers and readers stay in sync', () => {
  const first = useReaderChromeProgress();
  const second = useReaderChromeProgress();

  assert.equal(first as unknown, second as unknown);
});

test('a write to the shared value is visible through a later read of the same slot', () => {
  useReaderChromeProgress().value = 0.42;
  useReaderChromeOwner().value = 'GEN:1';

  assert.equal(useReaderChromeProgress().value, 0.42);
  assert.equal(useReaderChromeOwner().value, 'GEN:1');

  // Transient UI-thread state only: nothing here is persisted, so restore the
  // resting values the chapter/focus lifecycle would write.
  useReaderChromeProgress().value = 0;
  useReaderChromeOwner().value = '';
});

test('writing the progress slot never disturbs the owner slot', () => {
  useReaderChromeProgress().value = 0.9;

  assert.equal(useReaderChromeOwner().value, '');

  useReaderChromeProgress().value = 0;
});
