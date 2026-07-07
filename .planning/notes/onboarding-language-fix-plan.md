# Onboarding Language Selection — Investigation & Fix Map (for Codex)

**Planned by:** Opus 4.8 (investigation) · **Execute:** Codex · **Verify:** Opus
**Symptom (user, confirmed):** First-time setup on an **English** phone — (1) couldn't select English in the
**Bible/translation list**, and (2) the **language search wasn't working**.

## Answer to "Android build problem or deeper?"
**Deeper.** This is shared app logic (`src/screens/onboarding/LocaleSetupFlow.tsx` +
`src/screens/bible/bibleTranslationModel.ts`), not Android-specific — it behaves the same on iOS. A
rebuild won't fix it.

---

## What I VERIFIED (read this first — the English happy-path is already correct)
Do **not** assume English selectability is broken at the data layer; it is not. Confirmed by tracing:
- Bundled **English BSB is seeded synchronously** at store creation: `getDefaultBibleTranslations()`
  (`src/stores/bibleStore.ts:258`) → `hydrateSeededTranslation` → BSB has `hasText:true`,
  `source:'bundled'`, and `isDownloaded:true` (`src/constants/translations.ts:8-20`,
  `src/stores/persistedStateSanitizers.ts:316-401`). Therefore
  `isTranslationReadableLocally` → `getTranslationSelectionState` returns `isSelectable:true`
  (`bibleTranslationModel.ts:168-186, 515-546`). **English is always selectable from launch — there is
  no seeding race for English.**
- `getVisibleTranslationsForPicker` keeps bundled (non-runtime) translations visible **even while the
  runtime catalog is hydrating** (`bibleTranslationModel.ts:484-513`), so English shows during load.
- The search filter is correct: `filterTranslationsBySearchQuery` + `normalizeTranslationSearchText` +
  `fuzzyTokenMatches` (`bibleTranslationModel.ts:112-141, 299-341`) — searching "english" matches the
  haystack (id/name/language/label).
- For an English device, the recommendation scorer ranks English BSB #1 (`LocaleSetupFlow.tsx:179-246`).

**Conclusion:** no deterministic logic bug in the English happy path. The reported failure is either an
intermittent/environmental condition **or** the concrete UX/robustness gaps below (which DO match the
symptoms). Fix the gaps; also try to reproduce the exact failure.

---

## Fixes to implement

### Fix 1 — HEADLINE: the search box + full language list are HIDDEN by default in first-time setup
This is the most likely cause of BOTH symptoms and is fully reproducible.
- In `LocaleSetupFlow.tsx`, initial mode starts with `showBibleLanguagePicker = false`
  (`:108`). The search `TextInput` only renders when `mode !== 'initial' || showBibleLanguagePicker`
  (`:736`), and the full grouped list only renders in the else-branch (`:763-793`). So the default
  initial view shows **one recommended Bible + a "Bible language preference" button, with NO search box**.
  → "search wasn't working" (it isn't shown) and "couldn't select English" if the user expected to
  browse/search instead of tapping the single recommendation.
- **FIX:** In initial mode, **always show the search box and the full grouped language list** (keep the
  recommended option pinned at the top / visually highlighted). Remove the requirement to tap
  "Bible language preference" to reveal search + list. (Either drop the `showBibleLanguagePicker` gate
  for initial mode, or default it to `true`, and keep the recommendation as the first item.)

### Fix 2 — ROBUSTNESS: runtime-catalog hydration can hang the screen
- `LocaleSetupFlow.tsx:258-280` calls `ensureRuntimeCatalogLoaded()` with **no timeout**. If it never
  resolves (slow/no network), `isHydratingRuntimeCatalog` stays `true` forever → the spinner persists
  and the empty-state/retry UI (gated on `!isHydratingRuntimeCatalog`, `:795`) never appears.
- **FIX:** bound the hydration with a timeout (e.g. `Promise.race` against ~6–8s) so
  `isHydratingRuntimeCatalog` always clears; on timeout/failure, still render the bundled options
  (English etc.) plus a small "couldn't load more languages — Retry" affordance. **Never block the
  bundled English option on the online catalog.**

### Fix 3 — ROBUSTNESS: interface-language select can silently no-op (secondary)
- `handleInterfaceLanguageSelect` (`:424-430`) does `await changeLanguage()` **before** closing the
  picker / advancing. If `changeLanguage` throws (a locale dynamic-import failure for a non-English
  language), the picker never closes and selection silently fails.
- **FIX:** apply the UI selection state and close the picker regardless of `changeLanguage` success
  (try/catch; set state in `finally`). Not English-specific, but removes a real silent-failure path.

---

## Codex: confirm the trigger (TEST-FIRST — required)
1. Write failing test(s) FIRST, then fix:
   - Initial mode renders the search input + the full grouped language list **without** needing the
     "Bible language preference" tap (Fix 1).
   - When `ensureRuntimeCatalogLoaded()` never resolves, English BSB is still listed + selectable and the
     hydrating spinner clears within the timeout (Fix 2).
   - Interface-language selection still closes the picker when `changeLanguage` rejects (Fix 3).
   - Put logic-level tests in `src/screens/onboarding/localeSetupModel.test.ts`; source-assertion updates
     in `src/screens/onboarding/localeSetupFlowSource.test.ts`.
2. If, while reproducing, you find a **different** concrete root cause for "can't select English" on an
   English device, fix that too and document it in the PR/commit.

## Files
- `src/screens/onboarding/LocaleSetupFlow.tsx` (primary edits)
- `src/screens/onboarding/localeSetupModel.ts` + `localeSetupModel.test.ts` + `localeSetupFlowSource.test.ts`
- `src/screens/bible/bibleTranslationModel.ts` — reference only (verified correct; do not weaken)

## Constraints
- House rules: `StyleSheet.create` + theme colors + i18n keys, no `any`, don't break iOS.
- Keep green: `npm run typecheck` (0) · `npm run lint` (0) · `npm run test:release` (all pass). Update any
  source-assertion tests the changes touch — update expected values, don't delete/weaken tests.
- Work on a branch (e.g. `fix/onboarding-language`); don't touch unrelated working-tree state.

## Acceptance criteria (what Opus will re-check)
- [ ] Initial setup shows the **search box visible by default** and the **full language list**, with
      English BSB present and selectable **without** tapping "Bible language preference".
- [ ] Hydration is timeout-bounded — the screen can't get stuck on a spinner; bundled English is always
      selectable offline; a retry/empty affordance exists on catalog-load failure.
- [ ] Interface-language selection closes the picker even when `changeLanguage` rejects.
- [ ] New/updated tests reproduce the above and pass; typecheck + lint + test:release all green.
- [ ] Diff scope limited to the onboarding files (+ their tests); no unrelated changes.

## Verification plan (Opus, after Codex)
Re-run typecheck/lint/test:release; grep that the search/list are no longer gated behind
`showBibleLanguagePicker` in initial mode; confirm the new tests genuinely reproduce the issue and pass;
review the diff for scope + house-rule compliance; optionally a device check.
