---
phase: quick
plan: 260405-qu2
subsystem: bible-store
tags: [bug-fix, tdd, translation, offline, runtime-catalog]
dependency_graph:
  requires: []
  provides: [persist-last-used-translation]
  affects: [bibleStore, mergeRuntimeCatalogTranslations, applyRuntimeCatalog]
tech_stack:
  added: []
  patterns: [TDD red-green, one-line condition fix, node:test regression test]
key_files:
  modified:
    - src/stores/bibleStoreModel.ts
    - src/stores/bibleStoreModel.test.ts
decisions:
  - "Preserve runtime translations in the first merge loop when isDownloaded=true OR textPackLocalPath is set — avoids needing a separate 'installed' state enum check and mirrors what shouldPreserveBundledTranslation already does for bundled translations."
metrics:
  duration_seconds: 61
  completed_date: "2026-04-05T13:55:30Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick Plan 260405-qu2: Persist Last-Used Bible Translation Summary

## One-liner

Fixed `mergeRuntimeCatalogTranslations` to retain locally-installed runtime translations (isDownloaded or textPackLocalPath) even when the Supabase catalog omits them on restart, preventing spurious fallback to BSB.

## What Was Done

### Task 1 — Regression test (TDD RED)
Added a new test in `src/stores/bibleStoreModel.test.ts` that calls `mergeRuntimeCatalogTranslations` with four state entries (bsb bundled, hincv downloaded runtime, sparv1909 runtime-with-path, npiulb non-installed runtime) against an incoming catalog containing only a new KJV entry.

The test asserted that bsb, hincv, sparv1909, and kjv survive the merge while npiulb is dropped. The test failed immediately (RED) confirming the bug: the first loop's `source !== 'runtime'` condition dropped all three runtime entries — `hincv`, `sparv1909`, and `npiulb` — leaving only `bsb` and `kjv`.

**Commit:** `1ef6f98`

### Task 2 — One-line fix (TDD GREEN)
Changed the first loop condition in `mergeRuntimeCatalogTranslations` from:

```typescript
if (translation.source !== 'runtime') {
```

to:

```typescript
if (translation.source !== 'runtime' || translation.isDownloaded || Boolean(translation.textPackLocalPath)) {
```

This preserves runtime translations that are already installed locally in the first pass, so they are not lost when the incoming catalog omits them. Non-installed runtime entries still fall through and are dropped (refreshed from catalog). All 413 `release:verify` tests pass.

**Commit:** `053e96a`

## Decisions Made

- Used `isDownloaded || Boolean(textPackLocalPath)` as the preservation gate — this mirrors the existing `shouldPreserveBundledTranslation` helper and covers both fully-installed entries and partially-installed/pending entries. Adding a new enum check would have required touching more code with no behavioral benefit.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
node --test --import tsx src/stores/bibleStoreModel.test.ts
  5/5 pass, 0 fail

npm run release:verify
  413/413 pass, 0 fail
```

## Known Stubs

None.

## Self-Check: PASSED

- src/stores/bibleStoreModel.ts — modified (fix applied)
- src/stores/bibleStoreModel.test.ts — modified (regression test added)
- Commit 1ef6f98 — confirmed in git log
- Commit 053e96a — confirmed in git log
