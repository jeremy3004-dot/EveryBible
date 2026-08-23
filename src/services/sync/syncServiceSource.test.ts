import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'syncService.ts'),
  'utf8'
);
const identityCaptureBlock =
  source.match(
    /const captureSyncIdentity = async \([\s\S]*?(?=const syncReadingPlansForIdentity)/
  )?.[0] ?? '';

test('sync service avoids static progress and bible store imports so startup does not eagerly form a require cycle', () => {
  assert.equal(
    source.includes("import { useProgressStore } from '../../stores/progressStore';"),
    false,
    'syncService should not statically import useProgressStore because progressStore already lazy-loads sync work'
  );

  assert.equal(
    source.includes("import { useBibleStore } from '../../stores/bibleStore';"),
    false,
    'syncService should not statically import useBibleStore on the startup path'
  );

  assert.equal(
    source.includes("import('../../stores/progressStore')"),
    true,
    'syncService should lazy-load the progress store when a sync actually runs'
  );

  assert.equal(
    source.includes("import('../../stores/bibleStore')"),
    true,
    'syncService should lazy-load the bible store when a sync actually runs'
  );
});

test('syncPreferences does not upsert a manual chapter feedback ID number into user_preferences', () => {
  assert.equal(
    source.includes('chapter_feedback_id_number'),
    false,
    'syncPreferences should not write a manual chapter feedback ID number into user_preferences'
  );
});

test('syncPreferences writes appearance_palette into user_preferences (M8)', () => {
  // The column exists in the remote schema
  // (20260409091500_add_appearance_palette_to_user_preferences.sql) and is read
  // back by mapRemotePreferences, so the local→cloud upsert must include it or
  // the palette silently resets to the DB default when a remote row wins LWW.
  assert.equal(
    source.includes('appearance_palette: mergedPreferences.preferences.appearancePalette'),
    true,
    'syncPreferences should upsert appearance_palette so the palette reaches the cloud'
  );
});

test('syncPreferences writes hide_play_button_from_reading_tab into user_preferences (M8)', () => {
  assert.equal(
    source.includes('hide_play_button_from_reading_tab'),
    true,
    'syncPreferences should upsert hide_play_button_from_reading_tab so the preference reaches the cloud'
  );
});

test('cloud sync also restores and uploads reading plan progress for signed-in users', () => {
  assert.match(
    source,
    /syncPlanProgress/,
    'syncAll should include reading plan progress uploads so offline plan work reaches the backend'
  );
  assert.match(
    source,
    /getUserPlanProgress/,
    'pullFromCloud should restore reading plan progress on a new device after sign-in'
  );
});

test('syncAll captures once and passes one capability through every sub-sync retry', () => {
  assert.match(
    source,
    /runSyncCycleSubsyncs\(\s*\(\) => captureSyncIdentity\(expectedUserId, expectedGeneration\)/,
    'syncAll should own the single remote identity capture for its cycle'
  );
  assert.match(
    source,
    /progress: syncProgressForIdentity[\s\S]*readingPlans: syncReadingPlansForIdentity[\s\S]*preferences: syncPreferencesForIdentity/,
    'each sub-sync should receive the captured identity capability instead of recapturing auth'
  );
  assert.match(
    source,
    /syncPlanProgress\([\s\S]*identity\.expectedGeneration,[\s\S]*identity\s*\)/,
    'reading-plan upload should reuse the same captured capability'
  );
});

test('pullFromCloud binds its starting uid and checks it before applying local state', () => {
  assert.match(
    source,
    /export const pullFromCloud = async \(expectedUserId\?: string\)/,
    'pullFromCloud should accept the uid captured by the initial-sync effect'
  );
  assert.match(
    source,
    /captureSyncIdentity\(\s*expectedUserId/,
    'pullFromCloud should fail closed when its caller is already stale'
  );
  assert.match(
    source,
    /createSyncIdentityBoundary\(/,
    'pullFromCloud should use the injectable identity boundary for async continuations'
  );
  assert.match(
    source,
    /identity\.isCurrent\(\)/,
    'pullFromCloud should re-check identity before each local commit boundary'
  );
});

test('sync identity validates Supabase once, then uses local uid and generation checks', () => {
  assert.match(
    identityCaptureBlock,
    /const liveUserId = await getCurrentUserId\(\)/,
    'capture must validate the server identity before creating the local boundary'
  );
  assert.doesNotMatch(
    identityCaptureBlock.slice(identityCaptureBlock.indexOf('const boundary')),
    /getCurrentUserId\(\)/,
    'continuation checks must not re-read Supabase auth'
  );
});

test('pullFromCloud passes its captured uid into the reading-plan pull', () => {
  assert.match(
    source,
    /pullReadingPlansFromCloud\(identity\)/,
    'reading-plan restoration must use the same uid captured by the cloud pull'
  );
  assert.match(
    source,
    /const pullReadingPlansFromCloud = async \(\s*identity: SyncIdentityBoundary\s*\)/,
    'the reading-plan pull should preserve the same identity boundary'
  );
  assert.match(
    source,
    /getUserPlanProgress\(\s*undefined,\s*identity\.expectedUserId,\s*identity\.expectedGeneration,\s*identity\s*\)/,
    'the reading-plan service should receive the captured identity at its remote-fetch boundary'
  );
  const pullBlock = source.slice(
    source.indexOf('const pullReadingPlansFromCloud'),
    source.indexOf('const applyMergedReadingState')
  );
  assert.doesNotMatch(
    pullBlock,
    /ensureCloudProfile\(/,
    'the nested reading-plan pull should reuse the profile ensured by pullFromCloud'
  );
});

test('profile memo is active-cycle scoped and clears only after the last same-user cycle', () => {
  assert.match(
    source,
    /const activeSyncAllCycles = new Map<string, number>\(\)/,
    'profile dedupe should track active syncAll cycles per uid and auth generation'
  );
  assert.match(
    source,
    /ensureCloudProfileCycles\.getOrCreate\(cycleKey/,
    'concurrent same-session sub-syncs should share one profile ensure'
  );
  assert.match(
    source,
    /ensureCloudProfileCycles\.clear\(cycleKey\)/,
    'successful profile entries should be cleared when the final cycle ends'
  );
  assert.match(
    source,
    /if \(!result\.success\) \{[\s\S]*ensureCloudProfileCycles\.clear\(cycleKey\)/,
    'failed profile ensures must be evicted so transient retries can run again'
  );
});
