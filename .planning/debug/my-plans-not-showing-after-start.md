---
status: investigating
trigger: "Investigate issue: my-plans-not-showing-after-start"
created: 2026-04-09T14:23:04+05:45
updated: 2026-04-09T14:53:00+05:45
---

## Current Focus

hypothesis: Confirmed: start-plan writes local enrollment immediately, but signed-in refresh can overwrite it because the app uses slug-based plan ids while remote progress expects UUID plan ids; additionally, the list screen historically held a stale snapshot until refocus refresh was added.
test: Implement a targeted reconciliation step that preserves unsynced local progress during remote fetches, then add regression coverage for the merge behavior and verify the plans screen refresh test still passes.
expecting: A newly started plan should remain enrolled after returning to the list because the refetched progress list will retain local unsynced plan rows instead of wiping them.
next_action: patch the reading plan service reconciliation path and add regression tests

## Symptoms

expected: After starting a reading plan, it should appear on the My Plans tab/page.
actual: Plans are not appearing on My Plans even after starting them.
errors: No explicit error reported yet.
reproduction: Open a plan detail, tap the start/apply CTA, then go to My Plans and observe that the plan is missing.
started: Happening right now; likely a recent regression.

## Eliminated

## Evidence

- timestamp: 2026-04-09T14:37:00+05:45
  checked: workspace debug knowledge base
  found: No matching prior resolved issue overlaps this symptom set.
  implication: Treat this as a fresh investigation rather than a known pattern reuse.

- timestamp: 2026-04-09T14:38:00+05:45
  checked: git history and worktree state
  found: HEAD already includes a same-day commit `fa40e33 fix(plans): refresh my plans...` touching `src/screens/plans/PlansHomeScreen.tsx`, while unrelated `.planning` files are dirty and must be left alone.
  implication: Recent list-refresh changes are a prime suspect and the investigation must isolate whether the bug is already fixed in code or still reproducible.

- timestamp: 2026-04-09T14:40:00+05:45
  checked: `src/services/plans/readingPlanService.ts`
  found: `enrollInPlan(planId)` writes to `readingPlansStore` immediately via `readingPlansStore.getState().enrollPlan(planId)` before any Supabase call, and falls back to that local progress even if auth/backend is unavailable.
  implication: The detail-screen started state is backed by a real local persistence write, so the regression is more likely in how Plans/My Plans reloads or subscribes than in the enrollment write itself.

- timestamp: 2026-04-09T14:44:00+05:45
  checked: `src/screens/plans/PlanDetailScreen.tsx` and `src/screens/plans/PlansHomeScreen.tsx`
  found: `PlanDetailScreen` reads live enrollment from `useReadingPlansStore((state) => state.progressByPlanId[planId] ?? null)`, while `PlansHomeScreen` renders from its own `userProgress` React state loaded through `loadAllData()` instead of directly subscribing to the plans store.
  implication: The detail view can immediately show “started” while the list/home view still holds an older snapshot until it explicitly reloads.

- timestamp: 2026-04-09T14:45:00+05:45
  checked: `git show fa40e33^:src/screens/plans/PlansHomeScreen.tsx` versus current `src/screens/plans/PlansHomeScreen.tsx`
  found: Before commit `fa40e33`, `PlansHomeScreen` only loaded `userProgress`/`completedPlans` on mount via `useEffect`; the current file adds `useFocusEffect(() => loadAllData(true))` on screen refocus.
  implication: A real stale-screen bug existed in the prior implementation and the current fix targets that navigation-return path directly.

- timestamp: 2026-04-09T14:49:00+05:45
  checked: `src/data/readingPlans.generated.ts`, `supabase/migrations/20260322140400_create_reading_plans.sql`, and `src/services/plans/readingPlanService.ts`
  found: Bundled plans use slug strings such as `bible-in-1-year` for `ReadingPlan.id`, while Supabase defines `user_reading_plan_progress.plan_id` as a UUID foreign key to `reading_plans(id)`. The client sends the local string id directly in enroll/fetch sync calls and no slug→UUID mapping exists in the app.
  implication: Signed-in remote enrollment persistence cannot be trusted as implemented; any successful remote refresh can replace local progress with the server-backed list, which may be empty if the enroll upsert failed.

## Resolution

root_cause: Signed-in plan refreshes could discard a just-started local enrollment. `PlanDetailScreen` subscribed directly to the local plans store, so start looked successful immediately, but `PlansHomeScreen` rendered a separately fetched snapshot. The list-side refresh path called `getUserPlanProgress()`, and that code replaced local progress with the remote server list. Because bundled plans use slug ids like `bible-in-1-year` while the Supabase schema expects UUID `plan_id` foreign keys, remote enroll upserts can fail or omit the new plan, making the subsequent refresh wipe the unsynced local enrollment from My Plans.
fix: 
verification: 
files_changed: []
