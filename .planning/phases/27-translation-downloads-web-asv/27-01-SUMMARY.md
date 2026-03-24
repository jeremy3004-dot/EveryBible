---
phase: 27
plan: 01
subsystem: bible-translations
tags: [translations, sqlite, bundled-content, offline]
dependency_graph:
  requires: [26-01]
  provides: [web-asv-readable, bundled-translation-routing]
  affects: [bibleStore, TranslationBrowserScreen, bibleDatabase]
tech_stack:
  added: []
  patterns: [zustand-getState-outside-hooks, offline-catalog-fallback]
key_files:
  created: []
  modified:
    - src/stores/bibleStore.ts
    - src/screens/more/TranslationBrowserScreen.tsx
    - src/services/bible/browserRows.test.ts
    - package.json
decisions:
  - All three translations (BSB, WEB, ASV) are co-located in the single bundled bible-bsb-v2.db file rather than in separate per-translation databases; this was already implemented before this phase executed
  - downloadTranslation resolves silently for hasText translations rather than introducing a separate download flow
  - TranslationBrowserScreen uses useBibleStore.getState() inside callbacks to avoid making localTranslations a reactive dependency that would re-trigger the load effect on every store update
metrics:
  duration: ~25 minutes
  completed: 2026-03-24T02:34:44Z
  tasks_completed: 3
  files_changed: 4
---

# Phase 27 Plan 01: Translation Downloads — WEB & ASV Summary

**One-liner:** WEB and ASV translations (already bundled in bible-bsb-v2.db) are now selectable and immediately readable, with TranslationBrowserScreen updating the local reading state and offering an offline catalog fallback.

## What Was Done

### Context at Phase Start

Prior to this phase, commit `966f8a6` (feat: bundle ASV text pre-installed alongside BSB and WEB) had already:
- Rebuilt `assets/databases/bible-bsb-v2.db` to contain all three translations (93,270 verses: 31,086 BSB + 31,098 WEB + 31,086 ASV)
- Updated `scripts/build_bible_db.py` to include WEB and ASV in the SOURCE_DATA
- Set `hasText: true, isDownloaded: true` for ASV and `hasText: true` for WEB in `src/constants/translations.ts`

The `getTranslationSelectionState` model already returned `isSelectable: true` when `hasText: true`, and `setCurrentTranslation` already allowed switching to any translation with `hasText: true`. The Bible reader's `getChapter('web', ...)` query already worked because it queries `WHERE translation_id = ?` against the bundled DB.

### Changes Made in This Plan

**1. Fixed `downloadTranslation` stub in bibleStore (Rule 1 — Bug fix)**

The stub returned a user-visible error message for all non-BSB translations. For WEB and ASV (which have `hasText: true`), no download is needed — they are already present in the bundled database. The stub now:
- Silently marks the translation as `isDownloaded: true, installState: 'seeded'` when `hasText: true`
- Clears any existing error
- Still returns the "coming soon" message for translations that have neither text nor an installed pack

**2. Updated TranslationBrowserScreen to wire local reading translation**

The screen was saving Supabase preferences when the user selected a primary translation but never updating the local `currentTranslation` in bibleStore, so the Bible reader didn't reflect the choice.

Changes:
- Import `useBibleStore` and read `setCurrentTranslation`
- After a successful `setUserTranslationPreferences` call for the primary field, call `setCurrentTranslation(translationId.toLowerCase())` when the translation is locally available
- Use `useBibleStore.getState()` inside callbacks (not reactive selector) to avoid making `localTranslations` a reactive dependency that would re-trigger the load `useEffect`

**3. Added offline catalog fallback to TranslationBrowserScreen**

When `listAvailableTranslations()` returns an empty array (Supabase offline or unconfigured), the screen now builds a fallback list from the local store's bundled translations, showing all translations with `hasText: true` or `isDownloaded: true`.

**4. Added convenience scripts to package.json**

- `npm run build:bible-db` — rebuilds the database asset from source JSON
- `npm run verify:bible-db` — verifies the database has correct verse counts and FTS index

**5. Fixed pre-existing test regression (Rule 1 — Bug fix)**

`browserRows.test.ts` expected two books per row (`['GEN', 'EXO']`, `['MAT', 'MRK']`) from the old paired layout. The `buildBibleBrowserRows` implementation had been changed to a flat single-book-per-row layout in a prior commit without updating the test. Fixed the test assertions to match the current implementation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Pre-existing browserRows test mismatch**
- **Found during:** Release test run (was already failing before this plan)
- **Issue:** `buildBibleBrowserRows` was changed to a flat single-book-per-row layout in a prior commit, but `browserRows.test.ts` still expected the old two-books-per-row layout
- **Fix:** Updated test assertions to match the current flat layout (`['GEN']` and `['MAT']` instead of `['GEN', 'EXO']` and `['MAT', 'MRK']`)
- **Files modified:** `src/services/bible/browserRows.test.ts`
- **Commit:** c828f5a

### Plan Superseded by Prior Work

The plan's steps 1-3 (build conversion script, generate databases, bundle them) were already complete via commit `966f8a6`. The database `bible-bsb-v2.db` already contained all three translations. This phase focused on the wiring layer (steps 4-5) rather than the data generation layer.

## Known Stubs

None — WEB and ASV text reading is fully wired end-to-end through the bundled database.

## Self-Check: PASSED

Files modified confirmed in commit c828f5a:
- src/stores/bibleStore.ts — downloadTranslation updated
- src/screens/more/TranslationBrowserScreen.tsx — bibleStore wiring added
- src/services/bible/browserRows.test.ts — test expectations corrected
- package.json — build/verify scripts added

Tests: 62/62 passing after fix.
TypeScript: 0 errors.
Database: 93,270 verses (BSB + WEB + ASV), schema version 3, FTS index verified.
