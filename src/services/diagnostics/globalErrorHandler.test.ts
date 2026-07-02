import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// globalErrorHandler.ts transitively imports react-native-mmkv (via crashLogStore),
// which breaks tsx/esbuild's transform the same way RN component imports do.
// Source-regex assertions verify the wiring instead — see the summary's
// "source-regex testing pattern" note for why this is the established approach here.
function readSource(): string {
  return readFileSync(fileURLToPath(new URL('./globalErrorHandler.ts', import.meta.url).href), 'utf8');
}

test('installGlobalErrorHandlers chains to the original ErrorUtils handler instead of replacing it', () => {
  const source = readSource();

  assert.match(
    source,
    /const originalHandler = errorUtils\.getGlobalHandler\(\);/,
    'must capture the pre-existing handler before overriding it'
  );
  assert.match(
    source,
    /recordCrashLog\(toCrashLogEntry\(error, Boolean\(isFatal\), Date\.now\(\)\)\);\s*\n\s*originalHandler\(error, isFatal\);/,
    'must record the crash and then still invoke the original handler so RN redbox/native crash behavior is preserved'
  );
});

test('installGlobalErrorHandlers registers a Hermes unhandled-promise-rejection tracker', () => {
  const source = readSource();

  assert.match(
    source,
    /hermesInternal\?\.enablePromiseRejectionTracker/,
    'must guard on the Hermes API existing before calling it'
  );
  assert.match(
    source,
    /onUnhandled: \(_id, error\) => \{\s*\n\s*recordCrashLog\(toCrashLogEntry\(error, false, Date\.now\(\)\)\);/,
    'unhandled rejections should be recorded as non-fatal crash log entries'
  );
});

test('installGlobalErrorHandlers guards against double installation', () => {
  const source = readSource();

  assert.match(
    source,
    /if \(installed\) \{\s*\n\s*return;\s*\n\s*\}\s*\n\s*installed = true;/,
    'repeated calls (e.g. Fast Refresh) must not stack duplicate handler wrappers'
  );
});
