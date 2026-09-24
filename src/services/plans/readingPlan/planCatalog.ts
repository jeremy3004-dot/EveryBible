import type { ReadingPlan, ReadingPlanEntry } from '../types';
import type { PlanServiceResult } from './planServiceResult';

type ReadingPlanCatalog = typeof import('../../../data/readingPlans.generated');

const FEATURED_PLAN_IDS = ['bible-in-1-year'];
const TIMED_CHALLENGE_PLAN_IDS = new Set([
  'psalms-30-days',
  'proverbs-31-days',
  'sermon-on-the-mount-7-days',
  'bible-in-30-days',
  'bible-in-90-days',
  'nt-in-30-days',
  'gospels-30-days',
  'acts-28-days',
]);

// HomeScreen imports this service for listReadingPlans(), which it calls from an
// effect. Building the catalog expands every plan into its daily entries, so load
// it on the first call instead of while Home's module graph evaluates.
function readingPlanCatalog(): ReadingPlanCatalog {
  return require('../../../data/readingPlans.generated') as ReadingPlanCatalog;
}

export function getPlan(planId: string): ReadingPlan | undefined {
  return readingPlanCatalog().readingPlansById.get(planId);
}

/** A bundled plan's daily entries, or none for an unknown plan. */
export function getBundledPlanEntries(planId: string): ReadingPlanEntry[] {
  return readingPlanCatalog().readingPlanEntriesByPlanId[planId] ?? [];
}

let sortedPlans: ReadingPlan[] | null = null;

/**
 * The bundled catalog in display order, built once. Screens reload it on every
 * focus, and a fresh array each time made React treat an unchanged catalog as
 * new data. Callers only read it.
 */
export function getSortedPlans(): ReadingPlan[] {
  sortedPlans ??= [...readingPlanCatalog().readingPlans].sort(
    (left, right) => left.sort_order - right.sort_order
  );
  return sortedPlans;
}

export async function listReadingPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  return { success: true, data: getSortedPlans() };
}

export async function getPlanEntries(
  planId: string
): Promise<PlanServiceResult<ReadingPlanEntry[]>> {
  return { success: true, data: getBundledPlanEntries(planId) };
}

export async function getFeaturedPlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  const featured = getSortedPlans().filter((plan) => FEATURED_PLAN_IDS.includes(plan.id));
  return { success: true, data: featured.length > 0 ? featured : getSortedPlans().slice(0, 1) };
}

export async function getPlansByCategory(
  category: string
): Promise<PlanServiceResult<ReadingPlan[]>> {
  return {
    success: true,
    data: getSortedPlans().filter((plan) => plan.category === category),
  };
}

export async function getTimedChallengePlans(): Promise<PlanServiceResult<ReadingPlan[]>> {
  return {
    success: true,
    data: getSortedPlans().filter((plan) => TIMED_CHALLENGE_PLAN_IDS.has(plan.id)),
  };
}
