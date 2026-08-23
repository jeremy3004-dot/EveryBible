import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'useSync.ts'),
  'utf8'
);

test('initial sync is scoped to the authenticated uid and discards stale continuations', () => {
  assert.match(
    source,
    /useAuthStore\(\(state\) => state\.user\?\.uid \?\? null\)/,
    'useSync should subscribe to uid changes so an account switch retriggers initial sync'
  );
  assert.match(
    source,
    /initialSyncUserId/,
    'initial sync state should be keyed by the authenticated uid rather than one boolean'
  );
  assert.doesNotMatch(
    source,
    /hasInitialSynced/,
    'a single process-wide initial-sync boolean cannot distinguish account switches'
  );
  assert.match(
    source,
    /let isCancelled = false/,
    'each initial-sync effect needs cancellation state'
  );
  assert.match(
    source,
    /isCancelled\s*=\s*true/,
    'initial-sync cleanup should cancel stale effect continuations'
  );
  assert.match(
    source,
    /pullFromCloud\([^)]*currentUserId|pullFromCloud\([^)]*userId/,
    'initial sync should pass its captured uid into pullFromCloud'
  );
  assert.match(
    source,
    /syncAll\(currentUserId,\s*currentGeneration\)/,
    'foreground and reconnect sync cycles should pass one captured auth identity into syncAll'
  );
  assert.match(
    source,
    /performSync\(currentUserId,\s*currentGeneration\)/,
    'the initial follow-up push should retain the pull identity through its final live check'
  );
  assert.match(
    source,
    /createSyncCoordinator\(\)/,
    'initial pulls and regular syncs should share one serialized coordinator'
  );
  assert.match(
    source,
    /syncCoordinator\.enqueuePull/,
    'initial cloud pulls should enter the shared coordinator gate'
  );
  assert.match(
    source,
    /syncCoordinator\.enqueuePush/,
    'foreground and reconnect pushes should enter the shared coordinator gate'
  );
  assert.match(
    source,
    /liveAuthState\.authGeneration\s*!==\s*(?:generation|currentGeneration)/,
    'a queued initial pull should fail closed when its auth generation is stale'
  );
  assert.match(
    source,
    /if \(!pullSucceeded\) \{\s*return;/,
    'an unsuccessful initial pull must not trigger a follow-up push'
  );
});
