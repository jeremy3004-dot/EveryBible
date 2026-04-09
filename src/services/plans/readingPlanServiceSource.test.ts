import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'readingPlanService.ts'), 'utf8');

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
  assert.match(source, /export async function getSavedPlans/, 'saved-plans helper should be exported');
  assert.match(source, /export async function getCompletedPlans/, 'completed-plans helper should be exported');
  assert.match(source, /export async function getFeaturedPlans/, 'featured-plans helper should be exported');
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
