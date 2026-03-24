---
phase: 28-multi-translation-supabase-library
plan: 01
subsystem: database
tags: [supabase, postgres, sql, migration, typescript, ebible, rls, translations]

requires:
  - phase: 21-content-versioning-multiple-translations
    provides: translation_catalog and translation_versions tables with authenticated-only RLS

provides:
  - bible_verses Supabase table with (translation_id, book_id, chapter, verse, text, heading) schema and upsert-safe UNIQUE constraint
  - text_direction column on translation_catalog for RTL language support
  - anon SELECT policies on bible_verses, translation_catalog, and translation_versions so unauthenticated users can browse and download translations
  - scripts/ebible-book-map.ts with all 66 canonical OSIS book code mappings
  - scripts/import-ebible-translations.ts — idempotent eBible.org VPL import pipeline with CLI flags

affects:
  - 28-02 (app-side download and display of Supabase-hosted translations)
  - Any future plan that reads bible_verses from Supabase

tech-stack:
  added:
    - adm-zip ^0.5.16 (devDependency — zip extraction for VPL downloads)
    - "@types/adm-zip ^0.5.8" (devDependency — types for adm-zip)
  patterns:
    - Supabase upsert with onConflict targeting UNIQUE constraint for idempotent import
    - Service-role key bypasses RLS for server-side bulk inserts
    - Batch 500-row upserts to stay within Supabase per-request limits
    - adm-zip for in-memory zip extraction (no temp files)

key-files:
  created:
    - supabase/migrations/20260324160000_create_bible_verses.sql
    - scripts/ebible-book-map.ts
    - scripts/import-ebible-translations.ts
  modified:
    - package.json (added adm-zip devDependency)

key-decisions:
  - "bible_verses schema mirrors bundled SQLite verses table 1:1 so download data maps cleanly to local DB format"
  - "anon RLS policies added to all three translation tables so unauthenticated users can browse without requiring login"
  - "Import script uses service_role key (bypasses RLS) and is a dev/ops tool only — not called from the app"
  - "adm-zip added as devDependency (not dependency) since it is used only by the import script, not the app bundle"
  - "Typed Supabase client uses any generics in import script — database types file not available outside app context"

patterns-established:
  - "VPL XML parse: match <v b='BOOK' c='N' v='N'>text</v> tags, map book code through EBIBLE_BOOK_MAP, skip non-canonical books"
  - "Translation import: upsert catalog -> download zip -> parse VPL -> batch upsert verses -> upsert versions row"

requirements-completed: [MULTI-01]

duration: 4min
completed: 2026-03-24
---

# Phase 28 Plan 01: Multi-Translation Supabase Library — Backend Foundation Summary

**Supabase bible_verses table with anon read access, plus an idempotent eBible.org VPL import pipeline covering 200+ redistributable full-Bible translations**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-24T11:49:02Z
- **Completed:** 2026-03-24T11:53:30Z
- **Tasks:** 2
- **Files modified:** 4 (created 3, modified 1)

## Accomplishments

- Created Supabase migration adding bible_verses table with exact schema parity to bundled SQLite (translation_id, book_id, chapter, verse, text, heading) and UNIQUE constraint for safe upserts
- Added text_direction column to translation_catalog for RTL language support (Arabic, Hebrew, etc.)
- Fixed Phase 21 anon access gap by adding SELECT policies for anon role on translation_catalog, translation_versions, and bible_verses
- Created scripts/ebible-book-map.ts with all 66 canonical OSIS book code mappings and CANONICAL_BOOK_IDS export
- Created scripts/import-ebible-translations.ts — a full CLI pipeline supporting --translations, --languages, --all, --dry-run flags; fetches translations.csv, filters by OT=39/NT=27/redistributable/downloadable, downloads VPL zips, parses XML, and bulk-upserts in batches of 500

## Task Commits

1. **Task 1: Create Supabase migration for bible_verses table** - `78c0610` (feat)
2. **Task 2: Create eBible book map and TypeScript import script** - `7973223` (feat)

## Files Created/Modified

- `supabase/migrations/20260324160000_create_bible_verses.sql` - Creates bible_verses table, adds text_direction column, fixes anon RLS on all three translation tables
- `scripts/ebible-book-map.ts` - OSIS 3-letter book code to app book_id mapping for all 66 canonical books
- `scripts/import-ebible-translations.ts` - CLI import pipeline: translations.csv → VPL zip download → XML parse → Supabase bulk upsert
- `package.json` - Added adm-zip and @types/adm-zip as devDependencies

## Decisions Made

- `bible_verses` schema mirrors the bundled SQLite `verses` table exactly so downloaded data maps 1:1 without transformation
- anon SELECT policies added to all three translation tables — unauthenticated users need catalog visibility to browse and download translations
- Import script uses `service_role` key (bypasses RLS) — appropriate since it is an administrative ops tool, not called from the app
- `adm-zip` added as devDependency (not a runtime dependency) since it is only used by the import script
- Typed Supabase client uses `any` generics in import script since the app's generated database types file is not available in the scripts context — documented with eslint-disable comments

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript compilation errors on Supabase upsert calls**
- **Found during:** Task 2 (import script implementation)
- **Issue:** `createClient()` without type parameters produced `never`-typed table queries, causing TS2769 errors on all three upsert calls
- **Fix:** Changed to `createClient<any, any, any>()` and typed helper function parameters with `AnySupabaseClient = SupabaseClient<any, any, any>`
- **Files modified:** scripts/import-ebible-translations.ts
- **Verification:** `npm run typecheck` exits 0 with no errors
- **Committed in:** `7973223` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type error bug)
**Impact on plan:** Fix required for TypeScript strict mode compliance. No scope creep.

## Issues Encountered

- Pre-existing lint errors in LessonDetailScreen.tsx and supabase/functions/ files are out of scope — not caused by this plan's changes, logged as deferred items

## Known Stubs

None — this plan delivers server-side database infrastructure and a dev tool script. No UI stubs or placeholder data.

## User Setup Required

To use the import script, set these environment variables:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Dry run (no network calls to Supabase):
npx tsx scripts/import-ebible-translations.ts --dry-run --languages eng

# Import a single translation:
npx tsx scripts/import-ebible-translations.ts --translations engwebp

# Import priority languages (English, Spanish, Hindi, Nepali):
npx tsx scripts/import-ebible-translations.ts --languages eng,spa,hin,npi
```

The Supabase migration `20260324160000_create_bible_verses.sql` must be applied before running the import script:
```bash
supabase db push
```

## Next Phase Readiness

- `bible_verses` table is ready to receive data; run the import script to populate translations
- Phase 28 Plan 02 can implement the app-side download and local SQLite storage of Supabase-hosted translations
- All three translation tables (bible_verses, translation_catalog, translation_versions) are publicly readable by anon users — no auth required for browsing

---
*Phase: 28-multi-translation-supabase-library*
*Completed: 2026-03-24*
