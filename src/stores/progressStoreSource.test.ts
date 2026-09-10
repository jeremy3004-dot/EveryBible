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
    /getProgressSyncIdentity\(\)[\s\S]*setTimeout\([\s\S]*syncProgress\(expectedUserId, expectedGeneration\)/,
    'standalone progress sync should capture uid and auth generation before the deferred import can resolve'
  );

  assert.match(
    source,
    /const \{ useAuthStore \} = require\('\.\/authStore'\)[\s\S]*authState\.user\?\.uid[\s\S]*authState\.authGeneration/,
    'progress sync identity should be read synchronously without a startup import cycle'
  );

  assert.match(
    source,
    /if \(!expectedUserId\) \{[\s\S]*syncDebounceTimer = null;[\s\S]*return;/,
    'standalone progress sync should skip guest mutations'
  );

  assert.match(
    source,
    /resetForSignOut: \(\) => \{[\s\S]*if \(syncDebounceTimer\) clearTimeout\(syncDebounceTimer\);[\s\S]*syncDebounceTimer = null;/,
    'sign-out should cancel pending progress sync timers'
  );
});

test('progress store persists only the restored fields and skips unchanged writes', () => {
  assert.match(
    source,
    /const selectPersistedProgressState = \(state: ProgressState\) => \(\{[\s\S]*chaptersRead: state\.chaptersRead,[\s\S]*chaptersListened: state\.chaptersListened,[\s\S]*listeningMsByDate: state\.listeningMsByDate,[\s\S]*streakDays: state\.streakDays,[\s\S]*lastReadDate: state\.lastReadDate,[\s\S]*\}\);/,
    'progressStore should partialize down to exactly the fields sanitizePersistedProgressState restores'
  );

  assert.match(
    source,
    /partialize: selectPersistedProgressState,/,
    'the persist config should use the projection rather than serializing the whole store (computed getters included)'
  );

  assert.match(
    source,
    /storage: progressStorage,/,
    'the persist config should use the diffing storage adapter, not a bare createJSONStorage'
  );

  assert.match(
    source,
    /setItem: \(name, value\) => \{[\s\S]*hasSameSavedProgress\(lastSavedProgress\.state, value\.state\)[\s\S]*return;/,
    'an unchanged persisted payload should short-circuit before JSON serialization, so a chapter turn does not re-stringify the whole read ledger'
  );

  assert.match(
    source,
    /lastSavedProgress = result === undefined \? value : undefined;/,
    'only synchronous saves may be remembered — an async adapter must not suppress a write before it has finished'
  );
});
