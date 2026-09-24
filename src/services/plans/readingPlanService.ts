/**
 * The reading-plan service's public API. The implementation lives in `./readingPlan/`:
 *
 * - `planCatalog` — the bundled catalog, required on first use (never at import)
 * - `planProgressActions` — enrol, complete a day or session, leave
 * - `planLibrary` / `planGroups` — saved and finished plans; group assignments
 * - `planProgressFetch` / `planProgressSync` — reconcile with the account's server rows
 * - `planServerWrite` / `planProgressPush` — the server merge (batched) and upsert fallbacks
 * - `planTombstones` — server leave tombstones and their retries
 * - `planLiveStore` — folding server answers into the live store
 * - `planSyncIdentity` — binding a request to the signed-in account
 * - `*Model` files — the pure rules, unit-tested on their own
 *
 * Screens and hooks keep importing from this path.
 */
export {
  getFeaturedPlans,
  getPlanEntries,
  getPlansByCategory,
  getTimedChallengePlans,
  listReadingPlans,
} from './readingPlan/planCatalog';
export { assignPlanToGroup, getGroupPlans } from './readingPlan/planGroups';
export {
  getCompletedPlans,
  getSavedPlans,
  savePlanForLater,
  unsavePlan,
} from './readingPlan/planLibrary';
export {
  enrollInPlan,
  markDayComplete,
  markPlanSessionComplete,
  unenrollFromPlan,
} from './readingPlan/planProgressActions';
export { getUserPlanProgress } from './readingPlan/planProgressFetch';
export { syncPlanProgress } from './readingPlan/planProgressSync';
export type { PlanServiceResult } from './readingPlan/planServiceResult';
export { resolvePlanSyncIdentity } from './readingPlan/planSyncIdentity';
export { retryPlanTombstonesWithIdentity } from './readingPlan/planTombstones';
export {
  createReadingPlanService,
  type ReadingPlanService,
} from './readingPlan/localReadingPlanService';
