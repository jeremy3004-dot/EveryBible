import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { CrashLogEntry } from './crashLogEntry';

/**
 * The crash log is exercised for real in crashLogStore.test.ts; here it is
 * replaced so the assertions are about what the global handlers hand it.
 */
const recorded: CrashLogEntry[] = [];
mockModule(mock, sourcePath('services/diagnostics/crashLogStore.ts'), {
  recordCrashLog: (entry: CrashLogEntry) => {
    recorded.push(entry);
  },
  toCrashLogEntry: (error: unknown, isFatal: boolean, timestamp: number): CrashLogEntry =>
    error instanceof Error
      ? { message: error.message, stack: error.stack, isFatal, timestamp }
      : { message: String(error), isFatal, timestamp },
});

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
type RejectionOptions = {
  allRejections: boolean;
  onUnhandled: (id: number, error: unknown) => void;
};

const globals = globalThis as {
  ErrorUtils?: unknown;
  HermesInternal?: unknown;
};
const originalErrorUtils = globals.ErrorUtils;
const originalHermesInternal = globals.HermesInternal;

const handledByOriginal: Array<{ error: unknown; isFatal?: boolean }> = [];
const trackerOptions: RejectionOptions[] = [];
let installedHandler: ErrorHandler = () => {};
const originalHandler: ErrorHandler = (error, isFatal) => {
  handledByOriginal.push({ error, isFatal });
};

before(async () => {
  globals.ErrorUtils = {
    getGlobalHandler: () => originalHandler,
    setGlobalHandler: (handler: ErrorHandler) => {
      installedHandler = handler;
    },
  };
  globals.HermesInternal = {
    enablePromiseRejectionTracker: (options: RejectionOptions) => {
      trackerOptions.push(options);
    },
  };

  const { installGlobalErrorHandlers } = await import('./globalErrorHandler');
  installGlobalErrorHandlers();
  // A second call in the same runtime (Fast Refresh) must not stack wrappers.
  installGlobalErrorHandlers();
});

after(() => {
  globals.ErrorUtils = originalErrorUtils;
  globals.HermesInternal = originalHermesInternal;
});

test('installing replaces the global handler exactly once even when called twice', () => {
  assert.notEqual(installedHandler, originalHandler);
  assert.equal(trackerOptions.length, 1, 'the rejection tracker must not be registered twice');
});

test('a fatal JS error is recorded before the original handler still runs', () => {
  recorded.length = 0;
  handledByOriginal.length = 0;
  const error = new Error('render exploded');

  installedHandler(error, true);

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].message, 'render exploded');
  assert.equal(recorded[0].isFatal, true);
  assert.match(recorded[0].stack ?? '', /render exploded/);
  assert.deepEqual(handledByOriginal, [{ error, isFatal: true }]);
});

test('a non-fatal JS error is recorded as non-fatal and still chained', () => {
  recorded.length = 0;
  handledByOriginal.length = 0;
  const error = new Error('soft failure');

  installedHandler(error, false);

  assert.equal(recorded[0].isFatal, false);
  assert.deepEqual(handledByOriginal, [{ error, isFatal: false }]);
});

test('an error reported without an isFatal flag is recorded as non-fatal', () => {
  recorded.length = 0;

  installedHandler('a thrown string');

  assert.equal(recorded[0].message, 'a thrown string');
  assert.equal(recorded[0].isFatal, false);
});

test('recorded entries are stamped with the time the error surfaced', () => {
  recorded.length = 0;
  mock.timers.enable({ apis: ['Date'], now: 1_760_000_000_000 });

  try {
    installedHandler(new Error('timed'), true);
  } finally {
    mock.timers.reset();
  }

  assert.equal(recorded[0].timestamp, 1_760_000_000_000);
});

test('the Hermes tracker is asked for all rejections, not just late ones', () => {
  assert.equal(trackerOptions[0].allRejections, true);
});

test('an unhandled promise rejection is recorded as a non-fatal crash entry', () => {
  recorded.length = 0;
  const consoleError = mock.method(console, 'error', () => {});

  try {
    trackerOptions[0].onUnhandled(7, new Error('dangling await'));
  } finally {
    consoleError.mock.restore();
  }

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].message, 'dangling await');
  assert.equal(recorded[0].isFatal, false);
  assert.equal(consoleError.mock.callCount(), 1);
  assert.match(String(consoleError.mock.calls[0].arguments[0]), /Unhandled promise rejection/);
});

test('a rejection with a non-Error reason is still recorded', () => {
  recorded.length = 0;
  const consoleError = mock.method(console, 'error', () => {});

  try {
    trackerOptions[0].onUnhandled(8, { code: 'ENOENT' });
  } finally {
    consoleError.mock.restore();
  }

  assert.equal(recorded[0].message, '[object Object]');
  assert.equal(recorded[0].isFatal, false);
});
