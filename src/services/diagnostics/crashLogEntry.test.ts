import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendCrashLogEntry, toCrashLogEntry, type CrashLogEntry } from './crashLogEntry';

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
