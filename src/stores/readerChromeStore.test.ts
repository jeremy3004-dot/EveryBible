import test, { before, beforeEach, mock } from 'node:test';
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

// Snapshotted the moment the module is loaded, before any test writes to the
// slots — otherwise the resting-value assertions below would only be reading
// back whatever `beforeEach` had just written.
let valuesAtLoad: unknown[] = [];

before(async () => {
  ({ useReaderChromeProgress, useReaderChromeOwner } = await import('./readerChromeStore'));
  valuesAtLoad = madeMutables.map((mutable) => mutable.value);
});

// The chapter/focus lifecycle owns these resets in the app; here it keeps each
// test independent of whatever the previous one wrote to the shared slots.
beforeEach(() => {
  useReaderChromeProgress().value = 0;
  useReaderChromeOwner().value = '';
});

test('the reader chrome exposes one progress slot and one owner slot, made once', () => {
  assert.equal(madeMutables.length, 2);
});

test('reader chrome progress starts at zero and the owner at the empty key', () => {
  assert.deepEqual(valuesAtLoad, [0, '']);
  assert.equal(useReaderChromeProgress().value, 0);
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
});

test('writing the progress slot never disturbs the owner slot', () => {
  useReaderChromeProgress().value = 0.9;

  assert.equal(useReaderChromeOwner().value, '');
});

test('writing the owner slot never disturbs the progress slot', () => {
  useReaderChromeOwner().value = 'JHN:3';

  assert.equal(useReaderChromeProgress().value, 0);
});

// The chapter/focus lifecycle resets by writing the resting values back, not by
// swapping the boxes: readers already holding a slot must see the reset.
test('resetting the slots to their resting values is visible through an existing reference', () => {
  const progress = useReaderChromeProgress();
  const owner = useReaderChromeOwner();
  progress.value = 0.75;
  owner.value = 'PSA:23';

  useReaderChromeProgress().value = 0;
  useReaderChromeOwner().value = '';

  assert.equal(progress.value, 0);
  assert.equal(owner.value, '');
});
