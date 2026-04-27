# Multi-Session Prayer Plans Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add prayer-oriented reading plans that can contain multiple sessions inside the same day, specifically `Morning + Evening` and `Morning + Midday + Evening`, without bringing back a separate Rhythms surface.

**Architecture:** Keep the bundled local plans catalog as the source of truth, extend plan metadata and entries so a day can be partitioned into ordered sessions, and extend progress so session completion can be tracked independently from whole-day completion. Reuse the existing plan activity and reader pipelines, but add shared session-aware helpers so Plans home, Plan detail, and Bible reader all render the same session state.

**Tech Stack:** Expo React Native, TypeScript, Zustand persisted store, bundled reading plan catalog in `src/data/readingPlans.generated.ts`, existing plan activity helpers in `src/services/plans/readingPlanActivity.ts`.

---

## Scope Guardrails

- Keep one `Plans` surface. Do not reintroduce a `Rhythms` topic or navigation entry.
- Support only these daily session shapes in this pass:
  - `Morning + Evening`
  - `Morning + Midday + Evening`
- Do not ship `Night` session support in this pass.
- Avoid denominational names in plan titles.
- It is fine for plan detail copy to say the plans are inspired by historic Christian prayer traditions.
- Keep plans local-first. Do not make Supabase the source of truth for catalog structure.

## Product Shape

Examples of plan titles for this pass:

- `Morning and Evening Prayer`
- `Prayer Through the Day`
- `Psalms for Morning and Evening`
- `Morning, Midday, and Evening Prayer`

Examples of acceptable metadata copy:

- `Historic prayer`
- `Prayer of the Hours`
- `Psalms and Gospel prayer`
- `Inspired by historic Christian prayer traditions`

## Files Likely In Scope

- Modify: `src/services/plans/types.ts`
- Modify: `src/services/plans/readingPlanModel.ts`
- Modify: `src/services/plans/readingPlanModel.test.ts`
- Modify: `src/services/plans/readingPlanActivity.ts`
- Modify: `src/services/plans/readingPlanActivity.test.ts`
- Modify: `src/stores/readingPlansStore.ts`
- Modify: `src/stores/readingPlansStore.test.ts`
- Modify: `src/services/plans/readingPlanService.ts`
- Modify: `src/services/plans/readingPlanServiceSource.test.ts`
- Modify: `src/data/readingPlans.generated.ts`
- Modify: `src/data/readingPlans.generated.test.ts`
- Modify: `src/screens/plans/PlansHomeScreen.tsx`
- Modify: `src/screens/plans/plansHomeSource.test.ts`
- Modify: `src/screens/plans/PlanDetailScreen.tsx`
- Modify: `src/screens/plans/planDetailSource.test.ts`
- Modify: `src/screens/bible/BibleReaderScreen.tsx`
- Modify: `src/screens/bible/bibleReaderPlanFlowSource.test.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/coreLocaleCoverage.test.ts`
- Modify: `src/i18n/locales/coverage.test.ts`
- Modify: `docs/plans/2026-04-10-multi-session-prayer-plans.md` if implementation realities require updating the spec

## Task 1: Extend the plan domain model for session-aware days

**Files:**
- Modify: `src/services/plans/types.ts`
- Test: `src/services/plans/readingPlanModel.test.ts`

**Step 1: Write the failing type/model tests**

Add tests that assume the system can represent:

- a plan with `format: 'multi-session'`
- a plan with `sessionOrder: ['morning', 'evening']`
- plan entries with `session_key: 'morning' | 'midday' | 'evening'`

Test command:

```bash
node --test --import tsx src/services/plans/readingPlanModel.test.ts
```

Expected: FAIL because the new plan/session types do not exist yet.

**Step 2: Add the new types**

In `src/services/plans/types.ts`, add:

```ts
export type PlanSessionKey = 'morning' | 'midday' | 'evening';
export type ReadingPlanFormat = 'single-session' | 'multi-session';
```

Extend `ReadingPlan`:

```ts
format?: ReadingPlanFormat;
sessionOrder?: PlanSessionKey[];
```

Extend `ReadingPlanEntry`:

```ts
session_key?: PlanSessionKey | null;
session_title?: string | null;
session_order?: number | null;
```

**Step 3: Add model helpers for session-aware plans**

In `src/services/plans/readingPlanModel.ts`, add pure helpers:

- `isMultiSessionPlan(plan)`
- `getPlanSessionOrder(plan, entries)`
- `groupPlanEntriesBySession(entries, dayNumber)`
- `buildPlanSessionCompletionKey(plan, dayNumber, sessionKey, today?)`

These helpers must be pure and not depend on Supabase or UI state.

**Step 4: Re-run the model tests**

```bash
node --test --import tsx src/services/plans/readingPlanModel.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/plans/types.ts src/services/plans/readingPlanModel.ts src/services/plans/readingPlanModel.test.ts
git commit -m "feat: add multi-session reading plan domain model"
```

## Task 2: Make the plan activity helpers session-aware

**Files:**
- Modify: `src/services/plans/readingPlanActivity.ts`
- Test: `src/services/plans/readingPlanActivity.test.ts`

**Step 1: Write the failing tests**

Add tests for:

- grouping one day into `morning` and `evening` sections
- computing session chapter keys for a single session
- computing per-session completion summary from read/listen activity
- preserving existing single-session behavior

Test command:

```bash
node --test --import tsx src/services/plans/readingPlanActivity.test.ts
```

Expected: FAIL because the current helpers only understand whole-day flows.

**Step 2: Add session-aware summary types**

In `src/services/plans/readingPlanActivity.ts`, add:

```ts
export interface PlanSessionSummary {
  sessionKey: PlanSessionKey;
  title: string;
  targetChapterKeys: string[];
  completedChapterKeys: string[];
  targetChapterCount: number;
  completedChapterCount: number;
  isComplete: boolean;
}
```

Extend `CurrentPlanDaySummary` to optionally include:

```ts
sessions?: PlanSessionSummary[];
nextIncompleteSessionKey?: PlanSessionKey | null;
```

**Step 3: Implement grouping and session summaries**

Add helpers like:

- `getPlanDaySessionGroups(entries, dayNumber, plan?)`
- `getPlanSessionSummary({ entries, sessionKey, chaptersRead, listeningHistory, ... })`
- update `getCurrentPlanDaySummary(...)` so multi-session plans produce session summaries plus the existing day aggregate

Rule:

- single-session plans still return the same shape they do now
- multi-session plans return both total-day progress and per-session progress

**Step 4: Re-run the activity tests**

```bash
node --test --import tsx src/services/plans/readingPlanActivity.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/plans/readingPlanActivity.ts src/services/plans/readingPlanActivity.test.ts
git commit -m "feat: add session-aware plan activity summaries"
```

## Task 3: Extend plan progress to track session completion

**Files:**
- Modify: `src/services/plans/types.ts`
- Modify: `src/stores/readingPlansStore.ts`
- Test: `src/stores/readingPlansStore.test.ts`

**Step 1: Write the failing store tests**

Add tests for:

- marking a single session complete without completing the day
- completing the final session and then advancing `current_day`
- keeping recurring multi-session plans from entering permanent completed state
- rehydrating older progress rows that do not yet contain session completion data

Test command:

```bash
node --test --import tsx src/stores/readingPlansStore.test.ts
```

Expected: FAIL because store progress only tracks whole-day completion.

**Step 2: Extend persisted progress shape**

In `src/services/plans/types.ts`, extend `ReadingPlanProgress`:

```ts
completed_sessions?: Record<string, string>;
current_session?: PlanSessionKey | null;
```

Use key format:

- relative plans: `${dayNumber}:${sessionKey}`
- recurring plans: `${YYYY-MM-DD}:${sessionKey}`

**Step 3: Add store mutations**

In `src/stores/readingPlansStore.ts`, add:

- `markSessionComplete(planId, dayNumber, sessionKey, options?)`
- `isSessionComplete(planId, dayNumber, sessionKey, options?)`

Rules:

- completing a session updates `completed_sessions`
- if more sessions remain in that day, keep `current_day` fixed and advance `current_session`
- if the last session is completed, reuse the existing day-complete progression logic
- existing single-session plans can still flow through `markDayComplete`

**Step 4: Preserve backward compatibility**

Ensure persisted state with no `completed_sessions` still loads cleanly.

**Step 5: Re-run the store tests**

```bash
node --test --import tsx src/stores/readingPlansStore.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/services/plans/types.ts src/stores/readingPlansStore.ts src/stores/readingPlansStore.test.ts
git commit -m "feat: track multi-session prayer plan progress"
```

## Task 4: Keep the service layer local-first while adding session completion seams

**Files:**
- Modify: `src/services/plans/readingPlanService.ts`
- Test: `src/services/plans/readingPlanServiceSource.test.ts`

**Step 1: Write the failing source tests**

Add source assertions that:

- `getPlanEntries(planId)` remains local-first
- a new session-completion seam exists and routes through the shared store
- the service does not query remote plan catalog tables

Test command:

```bash
node --test --import tsx src/services/plans/readingPlanServiceSource.test.ts
```

Expected: FAIL because there is no session completion seam yet.

**Step 2: Add a session-completion service function**

In `src/services/plans/readingPlanService.ts`, add:

```ts
markPlanSessionComplete(planId: string, dayNumber: number, sessionKey: PlanSessionKey)
```

Behavior:

- local-first, same as the current plan completion seam
- only remote sync later if the remote progress schema is explicitly upgraded for session data
- do not invent a remote schema in this pass

**Step 3: Re-run the source tests**

```bash
node --test --import tsx src/services/plans/readingPlanServiceSource.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/services/plans/readingPlanService.ts src/services/plans/readingPlanServiceSource.test.ts
git commit -m "feat: add session completion seam to reading plan service"
```

## Task 5: Add the first multi-session prayer plans to the bundled catalog

**Files:**
- Modify: `src/data/readingPlans.generated.ts`
- Test: `src/data/readingPlans.generated.test.ts`

**Step 1: Write the failing generated-data tests**

Add tests that assert:

- at least one `Morning + Evening` plan exists
- at least one `Morning + Midday + Evening` plan exists
- the new plan titles avoid denominational labels
- their entries include session metadata

Test command:

```bash
node --test --import tsx src/data/readingPlans.generated.test.ts
```

Expected: FAIL because these prayer plans do not exist yet.

**Step 2: Add neutral-title plans**

In `src/data/readingPlans.generated.ts`, add plan rows like:

- `morning-and-evening-prayer`
- `prayer-through-the-day`

Recommended metadata:

- `format: 'multi-session'`
- `sessionOrder: ['morning', 'evening']` or `['morning', 'midday', 'evening']`
- category: `devotional`

**Step 3: Add entries with session metadata**

Each day should include ordered session-grouped entries, for example:

```ts
{
  id: 'morning-and-evening-prayer-day-1-morning-psalm-63',
  plan_id: 'morning-and-evening-prayer',
  day_number: 1,
  session_key: 'morning',
  session_title: 'Morning',
  session_order: 1,
  book: 'PSA',
  chapter_start: 63,
  chapter_end: 63,
}
```

Do not add `night` entries.

**Step 4: Re-run the data tests**

```bash
node --test --import tsx src/data/readingPlans.generated.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data/readingPlans.generated.ts src/data/readingPlans.generated.test.ts
git commit -m "feat: add bundled multi-session prayer plans"
```

## Task 6: Show session-aware progress on Plan detail

**Files:**
- Modify: `src/screens/plans/PlanDetailScreen.tsx`
- Test: `src/screens/plans/planDetailSource.test.ts`

**Step 1: Write the failing source tests**

Add tests that assert:

- plan detail renders session groups for multi-session plans
- current-day summary includes session-level progress
- the primary CTA targets the next incomplete session, not just the day

Test command:

```bash
node --test --import tsx src/screens/plans/planDetailSource.test.ts
```

Expected: FAIL because plan detail only understands whole-day rows.

**Step 2: Update current-day rendering**

In `src/screens/plans/PlanDetailScreen.tsx`:

- keep the existing hero and progress card
- for multi-session plans, replace the flat “today” row with nested session cards
- show status per session:
  - `Completed`
  - `Next`
  - `Upcoming`

**Step 3: Launch reader with explicit session context**

When the user taps `Morning`, `Midday`, or `Evening`, pass:

- `planId`
- `planDayNumber`
- `planSessionKey`
- `playbackSequenceEntries` for just that session
- `returnToPlanOnComplete: true`

Do not dump the whole day into the reader when a specific session was chosen.

**Step 4: Re-run the source tests**

```bash
node --test --import tsx src/screens/plans/planDetailSource.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/screens/plans/PlanDetailScreen.tsx src/screens/plans/planDetailSource.test.ts
git commit -m "feat: render session-aware prayer plan detail"
```

## Task 7: Show session-aware status on Plans home

**Files:**
- Modify: `src/screens/plans/PlansHomeScreen.tsx`
- Test: `src/screens/plans/plansHomeSource.test.ts`

**Step 1: Write the failing source tests**

Add tests that assert:

- active plan cards can render a session summary row
- multi-session plan cards show `Morning done`, `Evening next` style status
- there is still no rhythms copy or navigation on the home screen

Test command:

```bash
node --test --import tsx src/screens/plans/plansHomeSource.test.ts
```

Expected: FAIL because plan cards only show day-level state right now.

**Step 2: Update card summaries**

In `src/screens/plans/PlansHomeScreen.tsx`:

- detect `format: 'multi-session'`
- use the shared activity helpers to compute today’s session summaries
- show a compact row or stacked labels for:
  - `Morning completed`
  - `Midday next`
  - `Evening upcoming`

The main CTA remains `Continue`, but it should route to the next incomplete session.

**Step 3: Re-run the source tests**

```bash
node --test --import tsx src/screens/plans/plansHomeSource.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/screens/plans/PlansHomeScreen.tsx src/screens/plans/plansHomeSource.test.ts
git commit -m "feat: show prayer session status on plans home"
```

## Task 8: Keep BibleReader inside one plan session at a time

**Files:**
- Modify: `src/screens/bible/BibleReaderScreen.tsx`
- Test: `src/screens/bible/bibleReaderPlanFlowSource.test.ts`

**Step 1: Write the failing source tests**

Add tests that assert:

- BibleReader accepts `planSessionKey`
- completion of a session routes through the new session-completion seam
- finishing Morning can bounce back to Plan detail with Evening still available
- reader does not silently roll from Morning into Evening in the same playback session

Test command:

```bash
node --test --import tsx src/screens/bible/bibleReaderPlanFlowSource.test.ts
```

Expected: FAIL because reader only models whole-day plan sessions today.

**Step 2: Update the reader flow**

In `src/screens/bible/BibleReaderScreen.tsx`:

- treat `planSessionKey` as the active plan scope when present
- on final chapter of that session:
  - call `markPlanSessionComplete(...)`
  - if more sessions remain in the current day, return to `PlanDetail`
  - if this was the final session of the day, reuse the existing day-complete progression

**Step 3: Re-run the source tests**

```bash
node --test --import tsx src/screens/bible/bibleReaderPlanFlowSource.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/screens/bible/BibleReaderScreen.tsx src/screens/bible/bibleReaderPlanFlowSource.test.ts
git commit -m "feat: scope bible reader to multi-session prayer plan segments"
```

## Task 9: Add or reuse localized copy without reviving rhythm language

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/coreLocaleCoverage.test.ts`
- Modify: `src/i18n/locales/coverage.test.ts`
- Modify: additional locale files only if new keys are truly necessary

**Step 1: Minimize new copy**

Prefer reusing existing keys:

- `readingPlans.morningLabel`
- `readingPlans.eveningLabel`
- `readingPlans.completed`
- `readingPlans.nextUp`

Add new keys only if required. The one likely unavoidable addition is `middayLabel`.

**Step 2: Add failing locale coverage expectations**

Update coverage tests so missing new keys fail loudly.

Test command:

```bash
node --test --import tsx src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/locales/coverage.test.ts
```

Expected: FAIL if new keys are missing.

**Step 3: Add English keys and either translate or temporarily mirror**

If `middayLabel` is added, update all required locale files before finishing.

**Step 4: Re-run locale tests**

```bash
node --test --import tsx src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/locales/coverage.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/locales/coverage.test.ts src/i18n/locales/*.ts
git commit -m "feat: localize multi-session prayer plan labels"
```

## Task 10: Run the focused verification gate and do a manual smoke test

**Files:**
- No new files

**Step 1: Run focused automated verification**

```bash
npm run typecheck
node --test --import tsx \
  src/services/plans/readingPlanModel.test.ts \
  src/services/plans/readingPlanActivity.test.ts \
  src/stores/readingPlansStore.test.ts \
  src/services/plans/readingPlanServiceSource.test.ts \
  src/data/readingPlans.generated.test.ts \
  src/screens/plans/planDetailSource.test.ts \
  src/screens/plans/plansHomeSource.test.ts \
  src/screens/bible/bibleReaderPlanFlowSource.test.ts \
  src/i18n/locales/coreLocaleCoverage.test.ts \
  src/i18n/locales/coverage.test.ts
```

Expected: PASS.

**Step 2: Run lint on touched files or whole repo**

```bash
npm run lint
```

Expected: PASS.

**Step 3: Manual smoke test**

Run the app and verify:

1. `Morning and Evening Prayer` appears in Find Plans.
2. Starting it shows one enrolled plan card, not two or three.
3. Plan detail shows today’s session list.
4. Tapping `Morning` opens only Morning content.
5. Completing Morning returns to plan detail with Evening still pending.
6. Completing the last session advances the plan day.
7. `Prayer Through the Day` shows Morning, Midday, Evening only.
8. No `Rhythms` UI leaks back into Plans home.

**Step 4: Final commit**

```bash
git add src/services/plans src/stores src/data src/screens src/i18n docs/plans/2026-04-10-multi-session-prayer-plans.md
git commit -m "feat: add multi-session prayer plans"
```

## Rollout Order

1. Domain types and pure model helpers
2. Activity summaries
3. Store persistence and progress mutations
4. Service seam
5. Bundled plan catalog content
6. Plan detail UI
7. Plans home summaries
8. BibleReader session completion flow
9. Localization
10. Verification and smoke test

## Open Decisions Already Resolved For This Plan

- Use one plan with multiple daily sessions, not separate plans per session.
- Support `morning`, `midday`, `evening` only in this pass.
- Do not use denominational titles in the plan names.
- Do not revive the Rhythms feature as a parallel surface.

## Explicitly Out Of Scope

- `Night` prayer sessions
- full liturgical-calendar logic
- feast-day variants
- denomination-specific branding in titles
- separate rhythm enrollment, rhythm presets, or rhythm navigation
- server-side catalog management for these plans

## Risks To Watch

- Store migration bugs if `completed_sessions` is not defaulted safely
- Reader regressions if single-session plans accidentally start using session-only params
- localization churn if new keys are added carelessly instead of reusing existing labels
- generated data drift if the bundled catalog is changed without updating `src/data/readingPlans.generated.test.ts`

## Ready For Execution

This plan is intentionally biased toward a minimal diff:

- keep the catalog local-first
- extend the existing plan model instead of inventing a new feature family
- reuse the current plan detail and BibleReader flows instead of creating prayer-specific screens

That is the right shape for this feature.
