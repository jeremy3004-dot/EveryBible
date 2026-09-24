import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import type { CrashLogEntry } from './crashLogEntry';
import type { AppErrorReport } from './crashReportModel';

/**
 * The real crashLogStore (and the real `toCrashLogEntry`) is used here — only
 * MMKV is replaced — so these tests assert what actually lands on disk when a
 * global handler fires, not what a hand-written double would have recorded.
 *
 * Tests in this file are order-dependent on purpose: `installGlobalErrorHandlers`
 * installs process-wide handlers once per module instance, so the `before` hook
 * installs them and every test drives the captured handlers.
 */
const mmkv = mockMmkvStorage(mock);
// Collaborators of the remote crash-report queue (device details, current route).
mockReactNative(mock, { os: 'ios', version: '18.2' });
mockModule(mock, createRequire(import.meta.url).resolve('expo-constants'), {
  default: { default: { expoConfig: { version: '1.0.9' } } },
});
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { isReady: () => true, getCurrentRoute: () => ({ name: 'Home' }) },
});
const pendingReports = (): AppErrorReport[] =>
  JSON.parse(mmkv.store.get('diagnostics-crash-report-queue-v1') ?? '[]');

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

let crashLogStore: typeof import('./crashLogStore');
/** Entries as the real store persisted them, read back through the real reader. */
const persisted = (): CrashLogEntry[] => crashLogStore.getCrashLogs();
const reset = () => {
  mmkv.store.clear();
  handledByOriginal.length = 0;
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

  crashLogStore = await import('./crashLogStore');
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

test('a fatal JS error is persisted to the crash log before the original handler still runs', () => {
  reset();
  const error = new Error('render exploded');

  installedHandler(error, true);

  const entries = persisted();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].message, 'render exploded');
  assert.equal(entries[0].isFatal, true);
  assert.match(entries[0].stack ?? '', /render exploded/);
  assert.deepEqual(handledByOriginal, [{ error, isFatal: true }]);
});

test('a non-fatal JS error is recorded as non-fatal and still chained', () => {
  reset();
  const error = new Error('soft failure');

  installedHandler(error, false);

  assert.equal(persisted()[0].isFatal, false);
  assert.deepEqual(handledByOriginal, [{ error, isFatal: false }]);
});

test('an error reported without an isFatal flag is recorded as non-fatal', () => {
  reset();

  installedHandler('a thrown string');

  assert.equal(persisted()[0].message, 'a thrown string');
  assert.equal(persisted()[0].isFatal, false);
});

test('successive crashes accumulate in the log rather than replacing each other', () => {
  reset();

  installedHandler(new Error('first'), false);
  installedHandler(new Error('second'), true);

  assert.deepEqual(
    persisted().map((entry) => [entry.message, entry.isFatal]),
    [
      ['first', false],
      ['second', true],
    ]
  );
});

test('recorded entries are stamped with the time the error surfaced', () => {
  reset();
  mock.timers.enable({ apis: ['Date'], now: 1_760_000_000_000 });

  try {
    installedHandler(new Error('timed'), true);
  } finally {
    mock.timers.reset();
  }

  assert.equal(persisted()[0].timestamp, 1_760_000_000_000);
});

test('the Hermes tracker is asked for all rejections, not just late ones', () => {
  assert.equal(trackerOptions[0].allRejections, true);
});

test('an unhandled promise rejection is recorded as a non-fatal crash entry', () => {
  reset();
  const consoleError = mock.method(console, 'error', () => {});

  try {
    trackerOptions[0].onUnhandled(7, new Error('dangling await'));
  } finally {
    consoleError.mock.restore();
  }

  const entries = persisted();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].message, 'dangling await');
  assert.equal(entries[0].isFatal, false);
  assert.match(entries[0].stack ?? '', /dangling await/);
  assert.equal(consoleError.mock.callCount(), 1);
  assert.match(String(consoleError.mock.calls[0].arguments[0]), /Unhandled promise rejection/);
});

test('a rejection with a non-Error reason is still recorded', () => {
  reset();
  const consoleError = mock.method(console, 'error', () => {});

  try {
    trackerOptions[0].onUnhandled(8, { code: 'ENOENT' });
  } finally {
    consoleError.mock.restore();
  }

  assert.deepEqual(
    { ...persisted()[0], timestamp: 0 },
    { message: '[object Object]', isFatal: false, timestamp: 0 }
  );
});

test('a crash log write failure inside the handler never propagates to the app', () => {
  reset();
  const error = new Error('unwritable');
  const throwOnSet = mock.method(mmkv.mmkvInstance, 'set', () => {
    throw new Error('MMKV full');
  });

  try {
    assert.doesNotThrow(() => installedHandler(error, true));
  } finally {
    throwOnSet.mock.restore();
  }

  assert.deepEqual(persisted(), [], 'nothing could be written');
  assert.deepEqual(
    handledByOriginal,
    [{ error, isFatal: true }],
    'the redbox still gets the error'
  );
});

test('a fatal JS error is also queued as an anonymous crash report for the next launch', () => {
  reset();
  const error = new TypeError('verses is undefined for jane@example.com');

  installedHandler(error, true);

  const [report] = pendingReports();
  assert.equal(pendingReports().length, 1);
  assert.equal(report.kind, 'fatal');
  assert.equal(report.is_fatal, true);
  assert.equal(report.error_name, 'TypeError');
  assert.equal(report.message, 'verses is undefined for <email>');
  assert.equal(report.screen, 'Home');
  assert.equal(report.platform, 'ios');
  // The crash log still gets the unscrubbed local entry first.
  assert.equal(persisted()[0].message, 'verses is undefined for jane@example.com');
});

test('a non-fatal global error is queued as an error report', () => {
  reset();

  installedHandler(new Error('soft global failure'), false);

  assert.equal(pendingReports()[0]?.kind, 'error');
  assert.equal(pendingReports()[0]?.is_fatal, false);
});

test('an unhandled rejection is queued as a rejection report', () => {
  reset();
  const consoleError = mock.method(console, 'error', () => {});
  try {
    trackerOptions[0].onUnhandled(9, new Error('rejected fetch'));
  } finally {
    consoleError.mock.restore();
  }

  assert.equal(pendingReports()[0]?.kind, 'rejection');
  assert.equal(pendingReports()[0]?.message, 'rejected fetch');
});

// `throw Object.create(null)` (or a value whose toString throws) cannot be turned into a
// string. Building the log entry for it used to throw inside the handler, before the
// remote report and before RN's original handler, so the crash vanished entirely.
test('a thrown value that cannot be stringified still reaches the original handler', () => {
  reset();
  const unprintable = Object.create(null) as object;

  assert.doesNotThrow(() => installedHandler(unprintable, true));

  assert.deepEqual(handledByOriginal, [{ error: unprintable, isFatal: true }]);
  assert.equal(persisted().length, 1, 'the crash is still logged locally');
  assert.equal(pendingReports().length, 1, 'and still queued for upload');
  assert.equal(pendingReports()[0].kind, 'fatal');
});

test('an unprintable rejection reason never throws out of the tracker callback', () => {
  reset();
  const consoleError = mock.method(console, 'error', () => {});
  const reason = {
    toString() {
      throw new Error('toString exploded');
    },
  };
  try {
    assert.doesNotThrow(() => trackerOptions[0].onUnhandled(10, reason));
  } finally {
    consoleError.mock.restore();
  }

  // (Its remote report shares the previous test's fingerprint, so the session dedupe drops it.)
  assert.equal(persisted()[0]?.message, '[unprintable value]');
});
