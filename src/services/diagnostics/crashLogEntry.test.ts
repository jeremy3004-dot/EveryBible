import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendCrashLogEntry,
  MAX_CRASH_LOG_ENTRIES,
  toCrashLogEntry,
  toRenderErrorCrashLogEntry,
  type CrashLogEntry,
} from './crashLogEntry';

test('appendCrashLogEntry appends within the max size', () => {
  const existing: CrashLogEntry[] = [{ message: 'first', isFatal: false, timestamp: 1 }];
  const entry: CrashLogEntry = { message: 'second', isFatal: true, timestamp: 2 };

  const result = appendCrashLogEntry(existing, entry, 5);

  assert.deepEqual(result, [existing[0], entry]);
});

test('appendCrashLogEntry trims oldest entries once over the max', () => {
  const existing: CrashLogEntry[] = [
    { message: 'a', isFatal: false, timestamp: 1 },
    { message: 'b', isFatal: false, timestamp: 2 },
  ];
  const entry: CrashLogEntry = { message: 'c', isFatal: false, timestamp: 3 };

  const result = appendCrashLogEntry(existing, entry, 2);

  assert.deepEqual(
    result.map((e) => e.message),
    ['b', 'c']
  );
});

test('appendCrashLogEntry does not mutate the existing array', () => {
  const existing: CrashLogEntry[] = [{ message: 'a', isFatal: false, timestamp: 1 }];
  appendCrashLogEntry(existing, { message: 'b', isFatal: false, timestamp: 2 }, 5);

  assert.equal(existing.length, 1);
});

test('toCrashLogEntry captures message and stack from an Error', () => {
  const error = new Error('boom');
  const entry = toCrashLogEntry(error, true, 123);

  assert.equal(entry.message, 'boom');
  assert.equal(entry.isFatal, true);
  assert.equal(entry.timestamp, 123);
  assert.equal(typeof entry.stack, 'string');
});

test('toCrashLogEntry stringifies non-Error values', () => {
  const entry = toCrashLogEntry('plain string rejection', false, 456);

  assert.equal(entry.message, 'plain string rejection');
  assert.equal(entry.stack, undefined);
  assert.equal(entry.isFatal, false);
});

test('appendCrashLogEntry keeps only the newest MAX_CRASH_LOG_ENTRIES entries by default', () => {
  const existing: CrashLogEntry[] = Array.from({ length: MAX_CRASH_LOG_ENTRIES }, (_, index) => ({
    message: `entry-${index}`,
    isFatal: false,
    timestamp: index,
  }));
  const entry: CrashLogEntry = { message: 'newest', isFatal: true, timestamp: 99 };

  const result = appendCrashLogEntry(existing, entry);

  assert.equal(result.length, MAX_CRASH_LOG_ENTRIES);
  assert.equal(result[0].message, 'entry-1');
  assert.deepEqual(result.at(-1), entry);
});

test('a render error entry is non-fatal, tagged with its boundary scope, and appends the component stack', () => {
  const error = new Error('render failed');
  error.stack = 'Error: render failed\n    at Reader';

  const entry = toRenderErrorCrashLogEntry(
    error,
    'BibleReader',
    '\n    in Verse\n    in Chapter',
    7
  );

  assert.deepEqual(entry, {
    message: '[BibleReader] render failed',
    stack: 'Error: render failed\n    at Reader\nComponent stack:\n    in Verse\n    in Chapter',
    isFatal: false,
    timestamp: 7,
  });
});

test('a render error entry without a JS stack falls back to the message before the component stack', () => {
  const entry = toRenderErrorCrashLogEntry('thrown string', 'Home', '\n    in HomeScreen', 8);

  assert.deepEqual(entry, {
    message: '[Home] thrown string',
    stack: 'thrown string\nComponent stack:\n    in HomeScreen',
    isFatal: false,
    timestamp: 8,
  });
});

for (const componentStack of [null, undefined, '   \n  ']) {
  test(`a render error entry omits the component stack section when it is ${JSON.stringify(componentStack)}`, () => {
    const error = new Error('no trail');
    error.stack = 'Error: no trail';

    const entry = toRenderErrorCrashLogEntry(error, 'Plans', componentStack, 9);

    assert.equal(entry.stack, 'Error: no trail');
    assert.equal(entry.message, '[Plans] no trail');
  });
}

test('toCrashLogEntry never throws for a value that cannot be stringified', () => {
  const entry = toCrashLogEntry(Object.create(null), true, 5);
  assert.deepEqual(entry, { message: '[unprintable value]', isFatal: true, timestamp: 5 });
});

test('toCrashLogEntry survives an Error whose message getter throws', () => {
  const error = new Error('hidden');
  Object.defineProperty(error, 'message', {
    get() {
      throw new Error('getter exploded');
    },
  });
  const entry = toCrashLogEntry(error, false, 6);
  assert.equal(entry.message, '[unprintable value]');
  assert.equal(entry.isFatal, false);
});
