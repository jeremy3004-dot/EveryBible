---
phase: 18
plan: 01
subsystem: reading-plans
tags: [supabase, migration, types, service, reading-plans]
dependency_graph:
  requires: []
  provides: [reading_plans_v2_schema, user_saved_plans_table, reading_plan_entry_seeds, UserSavedPlan_type, plan_service_functions]
  affects: [src/services/plans, src/services/supabase/types.ts]
tech_stack:
  added: []
  patterns: [supabase-upsert-idempotency, two-step-query-for-related-rows, sql-union-all-seed-pattern]
key_files:
  created:
    - supabase/migrations/20260407000100_reading_plans_v2.sql
    - supabase/migrations/20260407000200_seed_reading_plan_entries.sql
    - scripts/generate-plan-entries.ts
  modified:
    - src/services/supabase/types.ts
    - src/services/plans/readingPlanService.ts
    - src/services/plans/index.ts
decisions:
  - Used ceiling-division remainder algorithm (Math.ceil(remaining/remaining)) to evenly distribute chapters across days without pre-computing totals
  - Chronological order: Job after Genesis, Psalms after 2 Samuel, minor prophets after Kings, post-exilic books (Ezra/Nehemiah/Esther) last in OT, then NT
  - UNION ALL pattern for SQL seed: single INSERT per plan with subqueries avoids needing plan UUIDs at generation time
  - getCompletedPlans uses .select('*, reading_plans(*)') join and reshapes the nested object into a flat union type
metrics:
  duration: ~15 minutes
  completed_date: 2026-04-07
  tasks_completed: 4
  files_changed: 6
---

# Phase 18 Plan 01: Database Migration, Type Updates, and Service Additions Summary

Adds three schema columns to `reading_plans`, creates `user_saved_plans` with RLS, seeds 1,093 day-by-day entry rows for all 8 reading plans, extends TypeScript types to reflect the new shape, and adds 6 new service functions for saving, completing, featuring, and categorizing plans.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create reading_plans_v2 migration (ALTER + user_saved_plans + RLS) | 65119d6 | supabase/migrations/20260407000100_reading_plans_v2.sql |
| 2 | Generate and seed 1093 reading_plan_entries rows for all 8 plans | ff0e05b | supabase/migrations/20260407000200_seed_reading_plan_entries.sql, scripts/generate-plan-entries.ts |
| 3 | Add cover_image_url/featured/completion_count to ReadingPlan, add UserSavedPlan interface and DB type map | fcca1f3 | src/services/supabase/types.ts |
| 4 | Add 6 service functions (savePlanForLater, unsavePlan, getSavedPlans, getCompletedPlans, getFeaturedPlans, getPlansByCategory) | 9ee3592 | src/services/plans/readingPlanService.ts, src/services/plans/index.ts |

## Entry Counts per Plan

| Plan | Entries |
|------|---------|
| sermon-on-the-mount-7-days | 7 |
| proverbs-31-days | 31 |
| psalms-30-days | 30 |
| epistles-30-days | 43 |
| gospels-60-days | 60 |
| new-testament-90-days | 109 |
| bible-in-1-year | 407 |
| genesis-to-revelation-chronological | 406 |
| **Total** | **1,093** |

## Decisions Made

1. **Ceiling-division distribution:** `Math.ceil(remainingChapters / remainingDays)` distributes unevenly without needing to pre-compute per-day targets. Remainder days get one fewer chapter naturally.
2. **UNION ALL seed pattern:** Each plan becomes a single `INSERT INTO ... UNION ALL SELECT id, day, book, start, end FROM reading_plans WHERE slug = '...'` — UUID independence at generation time, idempotent if re-run (the unique constraint on `plan_id, day_number, book, chapter_start` protects against duplicates).
3. **Two-step query for getSavedPlans:** Fetches `plan_id` list first, then fetches `reading_plans` by IDs. Avoids complex join that could be fragile with the current Supabase client typing.
4. **Chronological order source:** Public-domain simplified chronological sequence — Job after Genesis (patriarchal era), Psalms after 2 Samuel, Proverbs/Ecclesiastes/Song after Psalms, prophets interleaved with Kings/Chronicles, post-exilic books (Ezra/Nehemiah/Esther) after the prophets, then NT sequentially.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no UI, no hardcoded placeholder strings, no empty data sources wired to screens.

## Self-Check: PASSED

Files verified:
- supabase/migrations/20260407000100_reading_plans_v2.sql: FOUND
- supabase/migrations/20260407000200_seed_reading_plan_entries.sql: FOUND
- scripts/generate-plan-entries.ts: FOUND
- src/services/supabase/types.ts (UserSavedPlan): FOUND
- src/services/plans/index.ts (all 6 new exports): FOUND

Commits verified:
- 65119d6: FOUND
- ff0e05b: FOUND
- fcca1f3: FOUND
- 9ee3592: FOUND

TypeScript: `npm run typecheck` passes with zero errors.
