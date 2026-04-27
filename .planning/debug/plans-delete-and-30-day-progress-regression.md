---
status: investigating
trigger: "Investigate issue: plans-delete-and-30-day-progress-regression"
created: 2026-04-10T05:44:22+05:45
updated: 2026-04-10T06:05:00+05:45
---

## Current Focus

hypothesis: Confirmed for delete: bundled plans use slug ids locally while Supabase progress tables expect UUID `plan_id`, so remote delete/query paths that send `bible-in-30-days` directly can fail. The reader-side “already complete/stuck” symptom is likely separate and tied to plan-day completion being inferred from global same-day reading activity instead of resettable plan progress.
test: Verify the current local-first remote-sync guard closes the UUID delete path, then build a deterministic regression around `getCurrentPlanDaySummary` to prove whether a fresh `bible-in-30-days` enrollment can still look complete because of reused same-day activity.
expecting: Delete should stop erroring once slug-backed plans short-circuit remote sync/delete. For the reader bug, I expect a test can show a clean plan progress object with empty `completed_entries` still reports the current day complete when today's chapter activity matches the target day.
next_action: run targeted plan service/source tests, then add a focused activity-model regression for the `Bible in 30 Days` day-complete state

## Symptoms

expected: Swiping to delete a plan should remove it cleanly without an error. Inside a plan, the forward button should advance unless the current day is genuinely complete.
actual: Deleting a plan from My Plans shows `invalid input syntax for type uuid: "bible-in-30-days"`. Separately, for `Bible in 30 Days`, the forward button acts like the plan is already completed/stuck even though the user has not completed it in the current state.
errors: `invalid input syntax for type uuid: "bible-in-30-days"`
reproduction: 1) Open Plans > My Plans and swipe-delete a plan such as Bible in 30 Days. 2) Open Bible in 30 Days and try to use the forward button. It behaves as if the plan/day is already done.
started: Happening now. Repo already contains `.planning/debug/my-plans-not-showing-after-start.md` documenting slug-vs-UUID sync concerns for reading plans.

## Eliminated

## Evidence

- timestamp: 2026-04-10T05:44:22+05:45
  checked: workspace debug knowledge and prior unresolved plan investigation
  found: The existing `my-plans-not-showing-after-start` session already identified bundled slug ids and Supabase UUID `plan_id` expectations as a live mismatch risk, but it did not yet cover delete behavior or the `Bible in 30 Days` stuck-progress symptom.
  implication: Start by testing whether this regression is another manifestation of the same plan-id mismatch and stale local progress problem.

- timestamp: 2026-04-10T05:53:00+05:45
  checked: `git status`, recent commit history, and active plans screen/service/store code
  found: The worktree is dirty with many unrelated changes and a newer uncommitted `readingPlanService.ts` edit already adds `canSyncReadingPlanRemotely` / `shouldSyncPlanProgressRemotely` guards around slug-backed plan sync paths.
  implication: I must preserve existing unrelated work and build on the in-progress local-first sync fix rather than reintroducing overlapping edits.

- timestamp: 2026-04-10T05:55:00+05:45
  checked: `src/screens/plans/PlansHomeScreen.tsx` and `src/services/plans/readingPlanService.ts`
  found: Swipe delete calls `unenrollFromPlan(plan.id)`, and the service still performs a Supabase `.delete().eq('plan_id', planId)` when remote sync is enabled. For slug plan ids like `bible-in-30-days`, that matches the reported `invalid input syntax for type uuid` error.
  implication: The delete regression is a direct slug-vs-UUID remote query bug, not a generic swipe/UI issue.

- timestamp: 2026-04-10T05:59:00+05:45
  checked: `src/services/plans/readingPlanModel.ts`, `src/services/plans/readingPlanService.ts`, and Supabase schema/types
  found: The current local code models bundled plan ids as slugs, while Supabase progress tables define `plan_id` as a UUID foreign key. The in-progress guard treats only UUID-shaped ids as remotely syncable.
  implication: A local-first short-circuit is the correct minimal fix for bundled plan CRUD until a real slug↔UUID translation layer exists.

- timestamp: 2026-04-10T06:04:00+05:45
  checked: `src/screens/plans/PlanDetailScreen.tsx`, `src/screens/bible/BibleReaderScreen.tsx`, and `src/services/plans/readingPlanActivity.ts`
  found: Reader and plan detail “day complete” state comes from `getCurrentPlanDaySummary`, which only compares the target day chapters against same-day global `chaptersRead` / `listeningHistory`; it does not consult `progress.completed_entries` when deciding whether the current day looks complete.
  implication: A freshly restarted plan can still appear complete for today if the user already read the same chapters earlier that day, even with clean plan progress.

## Resolution

root_cause:
fix:
verification:
files_changed: []
