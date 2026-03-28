---
phase: 33-chapter-feedback-and-review-pipeline
plan: 01
subsystem: database
tags: [supabase, edge-functions, google-sheets, feedback, rls]
requires: []
provides:
  - Durable `chapter_feedback_submissions` storage in Supabase
  - Synced `chapter_feedback_enabled` preference column and app types
  - Edge Function contract for save-then-export spreadsheet delivery
  - Operator runbook for secrets, retry flow, and degraded-success handling
affects: [ui, analytics, release]
tech-stack:
  added: [Supabase Edge Function, Google Sheets append flow]
  patterns: [Supabase-first system of record, degraded success when export fails]
key-files:
  created:
    - supabase/migrations/20260327190000_create_chapter_feedback_pipeline.sql
    - supabase/functions/submit-chapter-feedback/index.ts
    - supabase/functions/submit-chapter-feedback/deno.json
    - docs/chapter-feedback-ops.md
  modified:
    - src/services/supabase/types.ts
    - src/services/sync/syncService.ts
    - src/services/sync/syncMerge.ts
    - src/stores/authStore.ts
    - src/stores/persistedStateSanitizers.ts
    - src/types/user.ts
key-decisions:
  - "Supabase is the source of truth; Google Sheets is an operator sink."
  - "Spreadsheet export failure returns degraded success instead of dropping feedback."
  - "The preference flag defaults to false for both new and existing installs."
patterns-established:
  - "Persist first, export second for any operator-facing feedback pipeline."
  - "Treat spreadsheet credentials as external setup, not hardcoded app config."
requirements-completed: [FDBK-01, FDBK-04]
duration: "~1 session"
completed: 2026-03-27
---

# Phase 33 Plan 01 Summary

**Supabase-backed chapter feedback storage with failure-tolerant Google Sheets export and synced off-by-default preference support**

## Accomplishments

- Added the backend schema and app-side types for chapter feedback submissions plus the synced feature flag.
- Implemented `submit-chapter-feedback` so rows are saved in Supabase before any spreadsheet export is attempted.
- Documented the operator workflow for secrets, retrying failed exports, and degraded-success support expectations.

## Files Created/Modified

- `supabase/migrations/20260327190000_create_chapter_feedback_pipeline.sql` - adds the feature flag column and feedback submission table
- `supabase/functions/submit-chapter-feedback/index.ts` - validates payloads, inserts rows, exports to Sheets, updates `export_status`
- `docs/chapter-feedback-ops.md` - operator setup, retry SQL, and QA guidance
- `src/services/supabase/types.ts` - typed feedback row contract and preference schema update
- `src/services/sync/syncService.ts` - syncs `chapter_feedback_enabled`

## Decisions Made

- Kept the first shipped version authenticated-only at the backend boundary.
- Used explicit `export_status` tracking instead of assuming Sheets append success.
- Preserved spreadsheet delivery as a separately repairable concern instead of coupling it to user-visible success/failure too tightly.

## Issues Encountered

- The only unresolved dependency is external: the real spreadsheet ID and Google service-account secrets are still required before production export can work.

## User Setup Required

- Provide `GOOGLE_SHEETS_SPREADSHEET_ID`
- Provide `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- Provide `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

## Next Phase Readiness

- The app can now wire a real opt-in feedback UI against a stable backend contract.
- Release remains blocked on spreadsheet credentials if the team wants live export in production.

---
*Phase: 33-chapter-feedback-and-review-pipeline*
*Completed: 2026-03-27*
