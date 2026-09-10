import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../../testing/mockModules';

/**
 * Separate file from globalErrorHandler.behavior.test.ts: the module installs
 * at most once per runtime, so the "host provides neither global" branch needs
 * its own module instance. The real crashLogStore is used (only MMKV is faked)
 * so "nothing was recorded" is asserted against real persistence.
 */
const mmkv = mockMmkvStorage(mock);

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
  const { getCrashLogs } = await import('./crashLogStore');

  assert.doesNotThrow(() => installGlobalErrorHandlers());
  assert.equal(globals.ErrorUtils, undefined);
  assert.equal(globals.HermesInternal, undefined);
  assert.deepEqual(getCrashLogs(), []);
  assert.deepEqual(Array.from(mmkv.store.keys()), [], 'nothing is written to storage');
});
