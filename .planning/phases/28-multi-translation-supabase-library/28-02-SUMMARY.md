---
phase: 28-multi-translation-supabase-library
plan: 02
subsystem: bible-data
tags: [translations, cloud-download, supabase, sqlite, offline-first]
dependency-graph:
  requires: [28-01]
  provides: [cloud-translation-download, translation-browser-ui]
  affects: [TranslationBrowserScreen, bibleStore, bibleDatabase]
tech-stack:
  added: []
  patterns: [supabase-paginated-query, per-translation-sqlite-file, dynamic-import]
key-files:
  created:
    - src/services/bible/cloudTranslationService.ts
  modified:
    - src/services/bible/index.ts
    - src/services/supabase/types.ts
    - src/stores/bibleStore.ts
    - src/screens/more/TranslationBrowserScreen.tsx
    - src/i18n/locales/en.ts
    - src/i18n/locales/es.ts
    - src/i18n/locales/ne.ts
    - src/i18n/locales/hi.ts
decisions:
  - "Use expo-file-system/legacy for documentDirectory and filesystem ops in cloudTranslationService; the new expo-file-system class-based API does not expose documentDirectory on its top-level namespace"
  - "Fetch Supabase bible_verses in pages of 5000 to respect free-tier response size limits"
  - "Dynamic import() of cloudTranslationService in bibleStore to avoid loading Supabase network code when not needed (keeps bundled-only flows lightweight)"
  - "Add cloudLibrary and downloading i18n keys to all four locales (en/es/ne/hi) to maintain locale parity"
metrics:
  duration: 7m
  completed: 2026-03-24
  tasks: 2
  files: 8
---

# Phase 28 Plan 02: Cloud Translation Download Service and Browser UI Summary

Cloud translation download pipeline via Supabase bible_verses table with per-translation SQLite files and progress-aware TranslationBrowserScreen UI.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create cloud translation download service, update Supabase types, and add barrel export | 896f5b7 | cloudTranslationService.ts, types.ts, index.ts |
| 2 | Wire bibleStore downloadTranslation to cloud service and update TranslationBrowserScreen with cloud catalog UI | 1315065 | bibleStore.ts, TranslationBrowserScreen.tsx, en/es/ne/hi.ts |

## What Was Built

**cloudTranslationService.ts** — New service that:
- Fetches total verse count from `bible_verses` Supabase table
- Downloads all verses in pages of 5000 (free-tier safe)
- Creates a per-translation SQLite file at `${documentDirectory}/translations/{id}.db`
- Applies the same schema as the bundled database: `verses` table, `idx_verses_unique`, `idx_verses_lookup`, and `verses_fts` virtual table
- Sets `PRAGMA user_version = 3` to match `BUNDLED_BIBLE_SCHEMA_VERSION`
- Reports `CloudDownloadProgress` callbacks through `fetching → writing → indexing → complete` phases
- Cleans up partial `.db` files on error

**bibleStore.downloadTranslation** — Replaced the "coming soon" stub with:
- Bundled translations (hasText=true): unchanged shortcut to `seeded`
- Already-installed translations: early no-op
- Cloud translations: dynamic import of `cloudTranslationService`, sets `downloadProgress` during download, sets `textPackLocalPath`, `isDownloaded`, `hasText`, `installState='installed'` on success; sets `installState='failed'` with `lastInstallError` on failure

**TranslationBrowserScreen** — Updated to:
- Show translations grouped into "Installed" and "Available" sections (replaces language grouping)
- Display cloud-download icon for non-installed translations
- Show `ActivityIndicator` with percentage during active download
- Dynamically add a translation to `bibleStore.translations` if it only exists in the Supabase catalog
- Subscribe to `bibleStore.downloadProgress` for live UI updates
- Rename "Available Translations" header to "Cloud Library"

**i18n** — Added `translations.cloudLibrary` and `translations.downloading` to en/es/ne/hi locale files. Existing keys (`installed`, `download`, `available`) were reused without duplication.

## Decisions Made

- Use `expo-file-system/legacy` for `documentDirectory`, `makeDirectoryAsync`, `getInfoAsync`, `deleteAsync` — consistent with `bibleDatabase.ts` and `audioDownloadStorage.ts` patterns.
- Dynamic `import()` of `cloudTranslationService` in `bibleStore` to keep bundled-only app startup lean.
- Page size of 5000 rows per Supabase query to stay within free-tier response limits.

## Verification

- `npm run typecheck`: 0 errors
- `npm run lint`: pre-existing errors only (LessonDetailScreen, BibleReaderScreen, Supabase edge functions) — none in modified files
- Bundled BSB/WEB/ASV shortcut via `hasText` check is completely unchanged
- `src/services/bible/index.ts` exports `cloudTranslationService` per barrel export rule

## Deviations from Plan

**1. [Rule 3 - Deviation] Changed expo-file-system import to legacy**
- **Found during:** Task 1 typecheck
- **Issue:** `expo-file-system` v2 top-level export in SDK 54 does not expose `documentDirectory` — it uses a new class-based `Paths.document` API. The plan specified using `expo-file-system`.
- **Fix:** Changed to `expo-file-system/legacy` to get `documentDirectory`, `makeDirectoryAsync`, `getInfoAsync`, and `deleteAsync`. This matches the existing patterns in `bibleDatabase.ts` and `audioDownloadStorage.ts`.
- **Files modified:** `src/services/bible/cloudTranslationService.ts`
- **Commit:** 896f5b7

**2. [Rule 2 - Auto-add missing critical functionality] Added i18n keys to es/ne/hi locales**
- **Found during:** Task 2 — CLAUDE.md requires locale parity across all 4 languages
- **Issue:** Plan only specified adding keys to `en.ts`. Adding keys to the English file without updating es/ne/hi would create missing-key warnings for non-English users.
- **Fix:** Added `cloudLibrary` and `downloading` translations to Spanish, Nepali, and Hindi locale files.
- **Files modified:** `src/i18n/locales/es.ts`, `src/i18n/locales/ne.ts`, `src/i18n/locales/hi.ts`
- **Commit:** 1315065

**3. Note: bibleStore.ts changes were pre-existing**

The worktree (`agent-ac6b8167`) already contained commit `f784480` which implemented the `downloadTranslation` cloud download logic in `bibleStore.ts`. This plan executed in the same worktree where prior agent work had been saved. The edit to `bibleStore.ts` was a no-op (content already matched the plan spec). The `TranslationBrowserScreen` and locale updates were new.

## Known Stubs

None — all wiring is complete. The `downloadCloudTranslation` function requires a live Supabase `bible_verses` table to be populated (handled by the Phase 28 migration in Plan 01). Manual device verification is required to confirm the full download-to-read flow works end-to-end.

## Self-Check

Verifying created files exist and commits are present...

## Self-Check: PASSED

All files exist at their expected paths. Both commits (896f5b7, 1315065) confirmed in git log.
