# Reading Plans Source Of Truth

## Decision

The mobile reading plan catalog and plan entries are bundled locally in the app.

- Catalog source: `src/data/readingPlans.generated.ts`
- Access seam: `src/services/plans/readingPlanService.ts`
- Guardrail test: `src/services/plans/readingPlanServiceSource.test.ts`

## What Supabase Is Allowed To Do

Supabase may store or sync user-specific reading-plan state, such as:

- saved plans
- enrollment and completion progress
- group plan assignments

Supabase is not the source of truth for:

- which plans exist
- plan metadata shown in the Plans tab
- the day-by-day plan entry schedule

## Why

Reading plans must load offline and deterministically on a fresh install. The app should not depend on network availability or remote catalog rows to render the Plans tab.

## Implementation Rule

If a future change touches reading plans:

1. Keep `listReadingPlans()` local-first.
2. Keep `getPlanEntries(planId)` local-first.
3. Do not query `reading_plans` or `reading_plan_entries` from the mobile client.
4. If the bundled catalog changes, update the generated data and keep the source test passing.

## Notes On Old Remote Tables

Historical Supabase migrations and tables for reading-plan catalog data may still exist, but they should be treated as retired for mobile catalog delivery unless there is an explicit architectural decision to replace this document.
