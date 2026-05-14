import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('new installs default to the midnight theme', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../stores/persistedStateSanitizers.ts', import.meta.url).href),
    'utf8'
  );

  assert.match(
    source,
    /defaultAuthPreferences[\s\S]*theme:\s*'midnight'/,
    'defaultAuthPreferences should use midnight as the persisted default theme'
  );
});
