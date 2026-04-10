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

test('signed-in reading plan fetch reconciles local and remote plan progress before replacing store state', () => {
  assert.match(
    source,
    /reconcileFetchedPlanProgress/,
    'full progress fetches should reconcile remote plan rows with recent local enrollments before replacing store state'
  );
  assert.match(
    source,
    /if \(planId\) \{[\s\S]*upsertProgress[\s\S]*\} else \{[\s\S]*replaceProgress\(reconciledProgress\)/,
    'full progress fetches should replace store state with reconciled plan progress instead of the raw remote list'
  );
});

test('slug-backed bundled plans stay local-first for sync and delete operations', () => {
  assert.match(
    source,
    /if \(!shouldSyncPlanProgressRemotely\(planId\)\) \{\s*return \{ success: true, data: localProgress \};\s*\}/s,
    'enrolling a bundled slug-backed plan should short-circuit before attempting a remote UUID upsert'
  );
  assert.match(
    source,
    /if \(!shouldSyncPlanProgressRemotely\(planId\)\) \{\s*return \{ success: true \};\s*\}/s,
    'unenrolling a bundled slug-backed plan should short-circuit before attempting a remote UUID delete'
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
