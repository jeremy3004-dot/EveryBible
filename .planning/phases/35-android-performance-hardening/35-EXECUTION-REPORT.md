# Phase 35 — Android Performance Hardening: Execution Report

**Branch:** `perf/android-hardening`
**Executor:** Claude Sonnet 4.6
**Date:** 2026-06-12
**Execution order:** P4 → P5 → P1 → P3 → P6 → P2

---

## Summary

All 6 tasks committed. 5 of 6 tasks are fully verified (typecheck + tests). P2 config is applied; on-device smoke test requires an Android device (not available in this session).

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| P4 — FlashList virtualization (PlanDetailScreen) | ✅ GREEN | `ae667b5`* | 2 spec-gap test fixes |
| P5 — FieldCard native-driver + Android overdraw | ✅ GREEN | (committed) | |
| P1 — Audio render storm fix | ✅ GREEN | (committed) | 1 spec-gap test fix |
| P3 — Scroll-collapse chrome off JS thread | ✅ GREEN | `b8110a0` | |
| P6 — Animate transform not layout bottom | ✅ GREEN | `4ce5d00` | |
| P2 — R8/ProGuard + resource shrinking | ⚠️ CONFIG APPLIED | `6dd8571` | Smoke test NOT run (no Android device) |

*P4 and P5 were committed in the previous session context before compaction.

---

## Task Results

### P4 — FlashList virtualization for PlanDetailScreen

**Acceptance output:**
```
grep -c "@shopify/flash-list" src/screens/plans/PlanDetailScreen.tsx  → 1
grep -c "ScrollView" src/screens/plans/PlanDetailScreen.tsx           → 0
grep -c "React.memo" src/screens/plans/PlanDetailScreen.tsx           → 1
```
All 528 release regression tests pass.

**Spec gaps fixed:**
- `planDetailSource.test.ts`: Updated `/dateLabel=\{dateLabel\}/` → `/dateLabel=\{item\.dateLabel\}/`
- `planDetailSource.test.ts`: Updated `/sessionActions=\{sessionActions\}/` → `/sessionActions=\{item\.sessionActions\}/`

---

### P5 — FieldCard native-driver + Android overdraw reduction

**Changes applied:**
- `progressAnim` spring: `useNativeDriver: false` → `useNativeDriver: true`
- `glowAnim` loop: `useNativeDriver: false` → `useNativeDriver: true`
- Glass overlay: Android gets flat `rgba(255,255,255,0.04)` View; iOS keeps LinearGradient
- Accent glow: Android gets flat `field.color + '14'`; iOS keeps LinearGradient
- Removed shadow* properties from `segmentDot` (not compositable with native-driver)

**Typecheck:** clean (exit 0)

---

### P1 — Audio render storm fix

**Files created/modified:**
- `src/hooks/useAudioPosition.ts` — new leaf hook (Zustand shallow selector for position/duration)
- `src/hooks/index.ts` — export added
- `src/components/bible/HighlightedVerseText.tsx` — wrapped in `memo`
- `src/components/audio/AudioPlayerBar.tsx` — switched to `useAudioPosition`
- `src/screens/bible/BibleReaderScreen.tsx` — `ReaderParagraphBlock` memo cell, `renderParagraphRef`, `paragraphRenderSignature`

**Acceptance output:**
```
grep -c "useAudioPosition" src/hooks/index.ts  → 1
grep -c "ReaderParagraphBlock" src/screens/bible/BibleReaderScreen.tsx  → 3+
```

**Spec gap fixed:**
- `bibleReaderChromeSource.test.ts` test 35: Updated `renderItem` assertion from inline arrow to `renderItem={renderParagraphBlock}`

**Typecheck:** clean (exit 0)

---

### P3 — Move scroll-collapse chrome off JS thread

**Changes applied:**
- `ReaderPlaybackDock.tsx`: `collapseProgress: number` → `collapseProgress: SharedValue<number>`; all 8 `interpolate(collapseProgress, ...)` → `interpolate(collapseProgress.value, ...)`
- `BibleReaderScreen.tsx` P3.6: Removed `readerBottomChromeProgress` useState and `readerBottomChromeProgressRef` useRef
- `BibleReaderScreen.tsx` P3.7: Replaced per-step JS state write (`if (Math.abs(...)) { setReaderBottomChromeProgress(...) }`) with single `readerBottomChromeProgressShared.value = nextProgress`
- `BibleReaderScreen.tsx` P3.8: Gated tab-bar reconciliation behind `didCollapsedFlip` boolean; simplified to binary `nextRootTabBarProgress`
- `BibleReaderScreen.tsx` P3.9: Removed `readerBottomChromeProgressRef.current = 0` and `setReaderBottomChromeProgress(0)` from chapter-reset effect
- `BibleReaderScreen.tsx` P3.10: `collapseProgress={readerBottomChromeProgress}` → `collapseProgress={readerBottomChromeProgressShared}`
- Tests updated: P3.11, P3.12, P3.13

**Acceptance output:**
```
grep -c "setReaderBottomChromeProgress" BibleReaderScreen.tsx  → 0
grep -c "readerBottomChromeProgressRef" BibleReaderScreen.tsx  → 0
grep -n "collapseProgress={readerBottomChromeProgressShared}"  → 1 match (line 4928)
grep -c "collapseProgress.value" ReaderPlaybackDock.tsx        → 8
grep -n "collapseProgress: SharedValue<number>;"               → 1 match (line 15)
```

**Tests:** 53/53 pass (`readerPlaybackDockSource.test.ts` + `bibleReaderChromeSource.test.ts`)
**Typecheck:** clean (exit 0)

---

### P6 — Animate transform, not layout `bottom`

**Changes applied:**
- `bottomDockAnimatedStyle` worklet: removed `bottom: interpolate(...)`, replaced with single `translateY` from `[0, readerDockCollapsedTranslateY]`
- Added `readerDockBaseBottom = layout.tabBarBaseHeight + spacing.xxl` constant
- Added `readerDockCollapsedTranslateY` derived constant
- Render site: added `{ bottom: readerDockBaseBottom }` static style
- Test updated (P6.3): `assert.match` for transform-only + `assert.doesNotMatch` for `bottom: interpolate`

**Acceptance output:**
```
grep -c "bottom: interpolate" BibleReaderScreen.tsx      → 0
grep -c "readerDockBaseBottom" BibleReaderScreen.tsx     → 3 (spec expected 2; extra ref in collapsedTranslateY calc — correct)
grep -c "readerDockCollapsedTranslateY" BibleReaderScreen.tsx → 2
```

**Tests:** 50/50 pass (`bibleReaderChromeSource.test.ts`)
**Typecheck:** clean (exit 0)

---

### P2 — Android R8/ProGuard + resource shrinking

**Config applied:**
- `expo-build-properties@~1.0.10` installed
- `app.json` updated with plugin entry:
  - `enableProguardInReleaseBuilds: true`
  - `enableShrinkResourcesInReleaseBuilds: true`
  - `hermesEnabled: true`
  - `extraProguardRules`: covers Reanimated, gesture-handler, SVG, MMKV, FlashList, screens, video-trim, view-shot, Google Sign-In, ExoPlayer, notifications, background-downloader, Hermes/RN JNI, Expo modules, OkHttp/Okio
- JSON valid: `python3 -c "import json; json.load(open('app.json'))"` exits 0

**Acceptance output:**
```
grep -n "expo-build-properties" package.json              → line 87: "expo-build-properties": "~1.0.10"
grep -c "enableProguardInReleaseBuilds" app.json          → 1
grep -c "enableShrinkResourcesInReleaseBuilds" app.json   → 1
grep -c "extraProguardRules" app.json                     → 1
grep -n "newArchEnabled" app.json                         → line 11: false ✅
```

**⚠️ Smoke test NOT run — no Android device/emulator available.**
The config must be validated with an on-device build before shipping a production AAB. See spec P2.4 for the full smoke-test procedure.

---

## Final Verification Gate

```
npm run typecheck  → exit 0 ✅
npm run lint       → 8 errors in PlanDetailScreen.tsx (react/prop-types on navigation props — PRE-EXISTING baseline, unchanged) ✅
npm run test:release → 528/528 pass ✅
```

---

## Spec Gaps Documented

| Task | Test File | Old Pattern | New Pattern | Reason |
|------|-----------|-------------|-------------|--------|
| P4 | planDetailSource.test.ts | `dateLabel={dateLabel}` | `dateLabel={item.dateLabel}` | View-model refactor moved inline var to `item.` prefix |
| P4 | planDetailSource.test.ts | `sessionActions={sessionActions}` | `sessionActions={item.sessionActions}` | Same view-model refactor |
| P1 | bibleReaderChromeSource.test.ts | `renderItem={({ item, index }) => renderParagraph(item, index)}` | `renderItem={renderParagraphBlock}` | Virtualized render path now uses stable memo callback |
| P6 | bibleReaderChromeSource.test.ts | `readerDockBaseBottom` count = 2 | actual = 3 | Spec undercounted: const also used in `readerDockCollapsedTranslateY` formula |
| P3 | bibleReaderChromeSource.test.ts | `collapseProgress={readerBottomChromeProgress}` | `collapseProgress={readerBottomChromeProgressShared}` | SharedValue prop thread lift |

---

## Human Verification Required (from risk register)

1. **P1 follow-along highlight** — On device with audio playing + follow-along enabled, confirm the highlighted verse advances correctly during playback and that scrolling/selection/bookmarking still update visibly. If any paragraph looks stale, `paragraphRenderSignature` is missing an input — report it.

2. **P2 minification** — Run the P2.4 smoke test on an Android device with a local production AAB before shipping. If any flow crashes, read the missing class from logcat, add a `-keep` rule to `extraProguardRules` in app.json, and rebuild. Never ship the AAB until this passes.
