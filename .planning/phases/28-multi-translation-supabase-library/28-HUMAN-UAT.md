---
status: partial
phase: 28-multi-translation-supabase-library
source: [28-VERIFICATION.md]
started: 2026-03-24T00:00:00Z
updated: 2026-03-24T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end cloud download on device
expected: Open TranslationBrowserScreen → Available section shows cloud translations → tap a translation → download progress % visible → after completion, translation appears in Installed section → opening that translation in BibleReaderScreen shows verse text
result: [pending]

### 2. Bundled BSB/WEB/ASV regression
expected: Switching to BSB, WEB, or ASV still works instantly (no network call, hasText shortcut resolves from bundled db), Genesis 1:1 loads correctly in each
result: [pending]

### 3. Offline graceful degradation
expected: With airplane mode enabled, TranslationBrowserScreen shows already-installed translations only (no crash), and a previously-downloaded translation is still readable in BibleReaderScreen
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
