import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'authStore.ts'),
  'utf8'
);
const callback =
  source.match(/supabase\.auth\.onAuthStateChange\([\s\S]*?authSubscription/)?.[0] ?? '';

test('the Supabase auth callback routes session changes through setSession reconciliation', () => {
  assert.match(
    callback,
    /get\(\)\.setSession\(session\)/,
    'auth callback session swaps must use setSession so account boundaries reconcile synchronously'
  );
  assert.doesNotMatch(
    callback,
    /set\(\{\s*session,\s*user:/,
    'auth callback must not bypass setSession with a direct identity write'
  );
});

test('auth boundaries reset per-user stores and preferences and advance the generation', () => {
  assert.match(
    source,
    /authGeneration:\s*number/,
    'auth state should expose a generation so same-uid reauthentication invalidates stale work'
  );
  assert.match(
    source,
    /shouldResetPerUserStateAtAuthBoundary/,
    'auth state should explicitly detect guest, switch, and sign-out boundaries'
  );
  assert.match(
    source,
    /preferences:\s*defaultAuthPreferences[\s\S]*preferencesUpdatedAt:\s*null/,
    'auth boundaries should restore default preferences before the next account sync'
  );
  assert.match(
    callback,
    /get\(\)\.setSession\(null\)/,
    'auth callbacks without a session must use the boundary-aware action'
  );
  assert.match(
    source,
    /get\(\)\.setSession\(restoredState\.session\)/,
    'restored sessions must reconcile before auth initialization exposes the UI'
  );
  assert.match(
    source,
    /preferences:\s*defaultAuthPreferences,[\s\S]*preferencesUpdatedAt:\s*null,[\s\S]*lastSyncedUserId:\s*null/,
    'explicit sign-out must reset preferences even if the auth callback is delayed'
  );
  assert.match(
    source,
    /applyAuthBoundaryEffects\([\s\S]*clearGuestTombstones: clearGuestPlanTombstones/,
    'production auth boundaries must consume only guest unenroll tombstones'
  );
});
