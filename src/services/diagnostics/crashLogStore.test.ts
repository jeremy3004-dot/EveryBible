import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { CrashLogEntry } from './crashLogEntry';

/**
 * Local MMKV double instead of `mockMmkvStorage`: crashLogStore's contract is
 * that it never throws out of an error handler, and the shared helper's
 * in-memory Map cannot be made to fail. This one can (`failOn`).
 */
const store = new Map<string, string>();
const failOn = new Set<'getString' | 'set' | 'delete'>();
const fail = (method: 'getString' | 'set' | 'delete') => {
  if (failOn.has(method)) {
    throw new Error(`MMKV ${method} failed`);
  }
};

const mmkvInstance = {
  getString: (key: string) => {
    fail('getString');
    return store.get(key);
  },
  set: (key: string, value: string) => {
    fail('set');
    store.set(key, value);
  },
  delete: (key: string) => {
    fail('delete');
    store.delete(key);
  },
  contains: (key: string) => store.has(key),
  getAllKeys: () => Array.from(store.keys()),
  clearAll: () => store.clear(),
};

mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  mmkvInstance,
  zustandStorage: {
    getItem: (name: string) => store.get(name) ?? null,
    setItem: (name: string, value: string) => store.set(name, value),
    removeItem: (name: string) => store.delete(name),
  },
});

let crashLogStore: typeof import('./crashLogStore');
let key: string;

const entry = (message: string, overrides: Partial<CrashLogEntry> = {}): CrashLogEntry => ({
  message,
  isFatal: false,
  timestamp: 1_700_000_000_000,
  ...overrides,
});

before(async () => {
  crashLogStore = await import('./crashLogStore');
  key = crashLogStore.CRASH_LOG_STORAGE_KEY;
});

beforeEach(() => {
  store.clear();
  failOn.clear();
});

test('an empty device reports no crash logs', () => {
  assert.deepEqual(crashLogStore.getCrashLogs(), []);
});

test('a recorded entry is persisted as JSON under the crash log key', () => {
  crashLogStore.recordCrashLog(entry('boom', { isFatal: true, stack: 'at boom' }));

  assert.deepEqual(JSON.parse(store.get(key) ?? 'null'), [
    { message: 'boom', isFatal: true, stack: 'at boom', timestamp: 1_700_000_000_000 },
  ]);
  assert.deepEqual(crashLogStore.getCrashLogs(), [
    entry('boom', { isFatal: true, stack: 'at boom' }),
  ]);
});

test('entries accumulate newest last', () => {
  crashLogStore.recordCrashLog(entry('first'));
  crashLogStore.recordCrashLog(entry('second'));

  assert.deepEqual(
    crashLogStore.getCrashLogs().map((item) => item.message),
    ['first', 'second']
  );
});

test('the ring buffer keeps only the twenty most recent entries', () => {
  for (let index = 0; index < 25; index++) {
    crashLogStore.recordCrashLog(entry(`crash-${index}`));
  }

  const messages = crashLogStore.getCrashLogs().map((item) => item.message);
  assert.equal(messages.length, 20);
  assert.equal(messages[0], 'crash-5');
  assert.equal(messages[19], 'crash-24');
});

test('a corrupt stored payload reads back as an empty log instead of throwing', () => {
  store.set(key, '{not json');

  assert.deepEqual(crashLogStore.getCrashLogs(), []);
});

test('a stored payload that is valid JSON but not an array reads back as an empty log', () => {
  store.set(key, JSON.stringify({ message: 'not an array' }));

  assert.deepEqual(crashLogStore.getCrashLogs(), []);
});

test('recording over a corrupt payload replaces it with a well-formed log', () => {
  store.set(key, '{not json');

  crashLogStore.recordCrashLog(entry('after corruption'));

  assert.deepEqual(
    crashLogStore.getCrashLogs().map((item) => item.message),
    ['after corruption']
  );
});

test('a failing MMKV write is swallowed so crash logging never throws inside an error handler', () => {
  failOn.add('set');

  assert.doesNotThrow(() => crashLogStore.recordCrashLog(entry('boom')));
  assert.equal(store.has(key), false);
});

test('a failing MMKV read reports an empty log rather than propagating', () => {
  failOn.add('getString');

  assert.deepEqual(crashLogStore.getCrashLogs(), []);
});

test('clearing removes the persisted log', () => {
  crashLogStore.recordCrashLog(entry('boom'));

  crashLogStore.clearCrashLogs();

  assert.equal(store.has(key), false);
  assert.deepEqual(crashLogStore.getCrashLogs(), []);
});

test('a failing MMKV delete leaves clearing best-effort instead of throwing', () => {
  crashLogStore.recordCrashLog(entry('boom'));
  failOn.add('delete');

  assert.doesNotThrow(() => crashLogStore.clearCrashLogs());
  assert.equal(store.has(key), true);
});

test('toCrashLogEntry is re-exported so error handlers need only this module', () => {
  const converted = crashLogStore.toCrashLogEntry(new Error('kaboom'), true, 42);

  assert.equal(converted.message, 'kaboom');
  assert.equal(converted.isFatal, true);
  assert.equal(converted.timestamp, 42);
  assert.match(converted.stack ?? '', /kaboom/);
});
