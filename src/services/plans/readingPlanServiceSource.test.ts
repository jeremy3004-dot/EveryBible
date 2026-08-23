import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'readingPlanService.ts'), 'utf8');
const planIdentityBoundaryBlock =
  source.match(
    /const boundary = createSyncIdentityBoundary\([\s\S]*?return \(await boundary\.isCurrent\(\)\)/
  )?.[0] ?? '';
const markPlanSessionCompleteBlock =
  source.match(
    /export async function markPlanSessionComplete[\s\S]*?(?=export async function getUserPlanProgress)/
  )?.[0] ?? '';

test('reading plan catalog and entries come from bundled local data', () => {
  assert.match(
    source,
    /export async function listReadingPlans[\s\S]*data:\s*getSortedPlans\(\)/,
    'listReadingPlans should serve the bundled on-device reading plans'
  );
  assert.match(
    source,
    /export async function getPlanEntries[\s\S]*readingPlanEntriesByPlanId\[planId\] \?\? \[\]/,
    'getPlanEntries should serve bundled local plan entries'
  );
  assert.doesNotMatch(
    source,
    /\.from\('reading_plans'\)|\.from\('reading_plan_entries'\)/,
    'reading plan catalog data should not be fetched from Supabase tables'
  );
});

test('reading plan service exports plans-screen helper queries', () => {
  assert.match(
    source,
    /export async function getSavedPlans/,
    'saved-plans helper should be exported'
  );
  assert.match(
    source,
    /export async function getCompletedPlans/,
    'completed-plans helper should be exported'
  );
  assert.match(
    source,
    /export async function getFeaturedPlans/,
    'featured-plans helper should be exported'
  );
  assert.match(
    source,
    /export async function getTimedChallengePlans/,
    'timed challenge helper should be exported'
  );
});

test('signed-in reading plan fetch reconciles local and remote plan progress without clobbering concurrent local edits', () => {
  assert.match(
    source,
    /reconcileFetchedPlanProgress/,
    'full progress fetches should reconcile remote plan rows with recent local enrollments before committing store state'
  );
  // L19: the commit path must re-read the live store and merge per-plan instead of
  // wholesale-replacing a stale snapshot, so a completion made during the fetch survives.
  assert.match(
    source,
    /const live = store\.getProgress\(progress\.plan_id\);[\s\S]*mergePlanProgress\(live, progress[\s\S]*store\.upsertProgress\(merged\)/,
    'commit should merge each reconciled row with the live store row (per-plan merge)'
  );
  assert.doesNotMatch(
    source,
    /\.replaceProgress\(/,
    'full fetch must not wholesale-replace store progress against a stale snapshot (L19)'
  );
  // L19: an in-flight commit must be skipped once the timeout fallback has already won.
  assert.match(
    source,
    /if \(fallbackWon\) \{[\s\S]*localFallback[\s\S]*stalePlanResult/,
    'the in-flight fetch should skip committing when the timeout fallback already returned'
  );
});

test('signed-in bundled plans persist remotely by slug instead of UUID-only plan ids', () => {
  assert.match(
    source,
    /buildRemoteReadingPlanProgressPayload/,
    'reading plan sync should build a slug-aware remote payload for signed-in recovery'
  );
  assert.match(
    source,
    /onConflict:\s*'user_id,plan_slug'/,
    'reading plan upserts should de-duplicate by user_id and plan_slug'
  );
  assert.match(
    source,
    /\.eq\('plan_slug',\s*planId\)/,
    'reading plan fetch/delete paths should address remote rows by plan_slug for bundled plans'
  );
  assert.doesNotMatch(
    source,
    /if \(!shouldSyncPlanProgressRemotely\(planId\)\) \{\s*return \{ success: true, data: localProgress \};\s*\}/s,
    'bundled slug-backed plans should no longer short-circuit to local-only enrollment when signed in'
  );
});

test('session completion stays local-first behind a dedicated service seam', () => {
  assert.match(
    source,
    /export async function markPlanSessionComplete/,
    'readingPlanService should expose a dedicated session-completion helper'
  );
  assert.match(
    markPlanSessionCompleteBlock,
    /markSessionComplete\(planId,\s*dayNumber,\s*sessionKey,\s*\{/,
    'markPlanSessionComplete should route through the shared reading plans store'
  );
  assert.doesNotMatch(
    markPlanSessionCompleteBlock,
    /\.from\('user_reading_plan_progress'\)/,
    'session completion should stay local-first until the remote schema is upgraded for session data'
  );
});

test('reading-plan cloud pulls bind the starting uid and re-check the live session before commit', () => {
  assert.match(
    source,
    /export async function getUserPlanProgress\(\s*planId\?: string,\s*expectedUserId\?: string,\s*expectedGeneration\?: number,\s*prevalidatedIdentity\?: SyncIdentityBoundary\s*\)/,
    'getUserPlanProgress should accept the identity captured when the pull started'
  );
  assert.match(
    source,
    /capturePlanSyncIdentity\(\s*expectedUserId/,
    'getUserPlanProgress should reject a stale caller before querying remote rows'
  );
  assert.match(
    source,
    /createSyncIdentityBoundary\(/,
    'the plan pull should use the injectable identity boundary before committing rows'
  );
  const liveSessionCheck = source.indexOf('identity.runIfCurrent');
  const commit = source.indexOf('commitReconciledProgress(reconciledProgress');
  assert.ok(
    liveSessionCheck >= 0 && liveSessionCheck < commit,
    'the live session check must happen immediately before commitReconciledProgress'
  );
});

test('plan pulls reuse a capability and retain standalone capture', () => {
  assert.match(
    source,
    /export const resolvePlanSyncIdentity = async \(/,
    'plan pulls should expose a small injectable identity seam for runtime coverage'
  );
  assert.match(
    source,
    /prevalidatedIdentity \?\? \(await captureIdentity\(\)\)/,
    'a prevalidated pull should not invoke the standalone remote capture'
  );
  assert.match(
    source,
    /identity\.expectedUserId !== expectedUserId[\s\S]*identity\.expectedGeneration !== expectedGeneration/,
    'reused capabilities must match both uid and generation'
  );
});

test('plan background pushes and tombstone deletes stay on their captured uid', () => {
  assert.match(
    source,
    /pushProgressToRemote\(\s*progress: UserReadingPlanProgress,\s*expectedUserId\?: string,\s*expectedGeneration:/,
    'background progress pushes should carry the uid captured at the local mutation'
  );
  assert.match(
    source,
    /buildRemoteReadingPlanProgressPayload\(progress, identity\.expectedUserId\)/,
    'background progress pushes should never derive a payload uid after the await'
  );
  assert.match(
    source,
    /deleteRemotePlanProgress\(\s*planId: string,\s*expectedUserId\?: string,\s*expectedGeneration:[\s\S]*prevalidatedIdentity\?: SyncIdentityBoundary/,
    'pending unenroll deletes should carry their captured uid'
  );
  assert.match(
    source,
    /\.eq\('user_id', identity\.expectedUserId\)/,
    'pending unenroll deletes should target only the captured account'
  );
  assert.match(
    source,
    /const cleared = await identity\.runIfCurrent\(\(\) => \{[\s\S]*clearPendingUnenroll/,
    "a returned delete must not clear another account's tombstone"
  );
  assert.match(
    source,
    /if \(!expectedUserId\) \{[\s\S]*clearPendingUnenroll\(planId\)[\s\S]*return \{ success: true \};/,
    'guest unenrolls must consume local tombstones without attempting a future account delete'
  );
  assert.match(
    source,
    /expectedGeneration !== undefined[\s\S]*getAuthGenerationSnapshot\(\) !== expectedGeneration/,
    'local-only tombstone cleanup must also reject a stale auth generation'
  );
  assert.match(
    source,
    /prevalidatedIdentity \?\?[\s\S]*capturePlanSyncIdentity\(/,
    'a sync cycle should reuse its prevalidated identity instead of recapturing auth per tombstone'
  );
  assert.match(
    source,
    /retryPendingUnenrolls\([\s\S]*identity\.expectedGeneration,[\s\S]*identity\s*\)/,
    'syncPlanProgress should pass the same identity capability through all tombstone retries'
  );
  assert.match(
    source,
    /retryPlanTombstonesWithIdentity\([\s\S]*prevalidatedIdentity,[\s\S]*deleteRemotePlanProgress/,
    'the tombstone retry helper should invoke each delete with the captured capability'
  );
});

test('plan progress captures the uid before dependency loading can yield', () => {
  const capture = source.indexOf(
    'const capturedUserId = expectedUserId ?? getAuthUserIdSnapshot();'
  );
  const dependencyLoad = source.indexOf(
    'const { supabase, isSupabaseConfigured } = await loadSupabaseModule();',
    capture
  );

  assert.ok(capture >= 0, 'plan progress should capture a uid synchronously at function entry');
  assert.ok(
    dependencyLoad < 0 || capture < dependencyLoad,
    'the uid snapshot must precede dependency loading so an account switch cannot rebind it'
  );
  assert.match(
    source,
    /capturePlanSyncIdentity\(\s*capturedUserId,\s*'fetch reading plan progress',\s*capturedGeneration\s*\)/,
    'the deferred plan fetch should use the fixed entry uid'
  );
  assert.match(
    source,
    /if \(getAuthUserIdSnapshot\(\) !== candidate\)/,
    'every plan identity continuation should check the live auth-store uid'
  );
  assert.match(
    source,
    /user\?\.id !== candidate/,
    'every plan identity continuation should check the live Supabase uid'
  );
  assert.match(
    source,
    /capturedGeneration !== undefined[\s\S]*getAuthGenerationSnapshot\(\) !== capturedGeneration/,
    'timeout fallbacks must reject same-uid continuations from an old auth generation'
  );
});

test('plan identity validates Supabase once, then uses local uid and generation checks', () => {
  assert.doesNotMatch(
    planIdentityBoundaryBlock,
    /requireSignedInUser/,
    'plan continuation checks must not call Supabase auth again after capture'
  );
  assert.match(
    planIdentityBoundaryBlock,
    /getAuthUserIdSnapshot\(\)/,
    'plan continuation checks should use the local auth uid'
  );
});

test('public plan sync keeps local progress when the backend is unconfigured', () => {
  const syncStart = source.indexOf('export async function syncPlanProgress(');
  const identityCapture = source.indexOf('capturePlanSyncIdentity(', syncStart);
  const localConfigGuard = source.indexOf(
    'return { success: true, data: localProgress };',
    syncStart
  );

  assert.ok(syncStart >= 0, 'syncPlanProgress should be exported');
  assert.ok(
    localConfigGuard >= 0 && localConfigGuard < identityCapture,
    'an unconfigured backend should return local progress before capturing auth identity'
  );
});

test('public plan sync accepts only a prevalidated identity capability for cycle reuse', () => {
  const syncStart = source.indexOf('export async function syncPlanProgress(');
  const syncBlock = source.slice(syncStart);
  assert.match(
    syncBlock,
    /expectedGeneration\?: number,\s*prevalidatedIdentity\?: SyncIdentityBoundary/,
    'cycle reuse should pass an opaque identity boundary rather than an unsafe boolean'
  );
  assert.match(
    syncBlock,
    /prevalidatedIdentity \?\?\s*\(await capturePlanSyncIdentity\(/,
    'standalone plan syncs should still capture and validate identity when no capability is supplied'
  );
  assert.match(
    syncBlock,
    /!supabaseModule\.isSupabaseConfigured\(\) \|\| !capturedUserId[\s\S]*applyLocalProgress/,
    'offline and guest plan syncs should apply supplied local progress after the entry boundary check'
  );
});
