// Startup import-graph guard: progressStore must keep the sync service off the boot graph (it
// would form a require cycle); allowed by docs/testing.md. Behaviour is in progressStore.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'progressStore.ts'),
  'utf8'
);

test('progress store avoids a static sync-service import so startup does not form a require cycle', () => {
  assert.equal(
    source.includes("import { syncProgress } from '../services/sync';"),
    false,
    'progressStore should not statically import syncProgress because it forms a runtime require cycle with syncService'
  );

  assert.equal(
    source.includes("import('../services/sync')"),
    true,
    'progressStore should load syncProgress lazily inside the debounce path so startup can initialize without the sync require cycle'
  );

  assert.match(
    source,
    /const \{ useAuthStore \} = require\('\.\/authStore'\)[\s\S]*authState\.user\?\.uid[\s\S]*authState\.authGeneration/,
    'progress sync identity should be read synchronously without a startup import cycle'
  );
});
