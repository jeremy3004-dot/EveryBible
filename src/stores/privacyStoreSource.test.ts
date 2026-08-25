import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'privacyStore.ts'),
  'utf8'
);

test('privacy retry keeps the prior error visible while unresolved initialization is pending', () => {
  assert.match(
    source,
    /const previousInitializationError = get\(\)\.initializationError;\s*set\(\{[\s\S]*isLoading: true,[\s\S]*initializationError: previousInitializationError,[\s\S]*isLocked: true,/,
    'privacy initialization should retain an existing error while a retry attempt is pending'
  );

  const retrySource = source.match(
    /retryInitialize: async \(\) => \{[\s\S]*?\n\s{4}\},\n\n\s{4}saveConfiguration:/
  )?.[0];
  assert.ok(retrySource, 'privacy retry implementation should be present');
  assert.match(
    retrySource,
    /if \(get\(\)\.isLoading\) \{\s*return;\s*\}/,
    'repeated retry presses should join the active attempt without changing state'
  );
  assert.doesNotMatch(
    retrySource,
    /initializationError:\s*null/,
    'retry should not clear the visible error before the unresolved attempt settles'
  );

  assert.match(
    source,
    /if \(result\.status === 'ready'\) \{[\s\S]*initializationError: null,/,
    'privacy initialization should clear the error only after success'
  );
});
