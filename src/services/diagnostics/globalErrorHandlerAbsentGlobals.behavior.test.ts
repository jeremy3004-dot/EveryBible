import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { CrashLogEntry } from './crashLogEntry';

/**
 * Separate file from globalErrorHandler.behavior.test.ts: the module installs
 * at most once per runtime, so the "host provides neither global" branch needs
 * its own module instance.
 */
const recorded: CrashLogEntry[] = [];
mockModule(mock, sourcePath('services/diagnostics/crashLogStore.ts'), {
  recordCrashLog: (entry: CrashLogEntry) => {
    recorded.push(entry);
  },
  toCrashLogEntry: (error: unknown, isFatal: boolean, timestamp: number): CrashLogEntry => ({
    message: String(error),
    isFatal,
    timestamp,
  }),
});

const globals = globalThis as { ErrorUtils?: unknown; HermesInternal?: unknown };
const originalErrorUtils = globals.ErrorUtils;
const originalHermesInternal = globals.HermesInternal;
delete globals.ErrorUtils;
delete globals.HermesInternal;

after(() => {
  globals.ErrorUtils = originalErrorUtils;
  globals.HermesInternal = originalHermesInternal;
});

test('installing on a runtime without ErrorUtils or HermesInternal is a silent no-op', async () => {
  const { installGlobalErrorHandlers } = await import('./globalErrorHandler');

  assert.doesNotThrow(() => installGlobalErrorHandlers());
  assert.equal(globals.ErrorUtils, undefined);
  assert.deepEqual(recorded, []);
});
