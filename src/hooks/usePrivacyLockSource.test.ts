import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'usePrivacyLock.ts'),
  'utf8'
);

test('usePrivacyLock avoids the stores barrel on the startup path', () => {
  assert.equal(
    source.includes("import { usePrivacyStore } from '../stores';"),
    false,
    'usePrivacyLock should not import the shared stores barrel during app startup'
  );

  assert.equal(
    source.includes("import { usePrivacyStore } from '../stores/privacyStore';"),
    true,
    'usePrivacyLock should read privacy state directly from privacyStore to keep boot imports narrow'
  );
});
