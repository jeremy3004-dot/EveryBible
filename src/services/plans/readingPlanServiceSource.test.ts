import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'readingPlanService.ts'), 'utf8');
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
    /if \(fallbackWon\) \{[\s\S]*return localFallback;/,
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
