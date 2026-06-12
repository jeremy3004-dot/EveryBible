# Phase 35: Android Performance Hardening - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning (executable spec already authored)
**Source:** Parallel codebase performance audit (4 auditors) → ranked findings → exact-edit execution plan

<domain>
## Phase Boundary

Fix the six diagnosed causes of slowness/jank on **older, low-end Android phones**
(~2–4 GB RAM, Android 9–12, weak GPUs, slow eMMC). Leads with the reported symptoms —
**scroll jank** and **navigation lag** — and keeps cold-start/animation jank in scope.

This phase is a **performance refactor + build-config change**: no new features, no
user-visible behavior change, no iOS regressions. In scope = P1–P6 below. Out of scope =
the low-priority cleanup items (P7–P10 from the audit: list tuning props, dead `expo-blur`
removal, asset recompression, no-selector Zustand subscriptions, nav theme memoization).
</domain>

<decisions>
## Implementation Decisions (locked)

The full, exact find/replace specification for every change lives in
**`35-EXECUTION-PLAN.md`** (co-located in this phase dir; also at
`.planning/notes/android-perf-fixes-EXECUTION-PLAN.md`). It is written for a literal executor:
verbatim `Find` → `Replace with` blocks + grep-checkable acceptance criteria per task.

### The six fixes (locked scope)
- **P1 / APERF-01 — Audio render storm (Critical).** `useAudioPlayer` ships `currentPosition`
  (≈250 ms tick) to every consumer; `BibleReaderScreen` re-renders 4–8×/sec and its inline,
  un-memoized `renderItem`/`renderParagraph` re-reconcile every verse cell. Fix: new
  `useAudioPosition()` leaf hook, `React.memo` on `HighlightedVerseText`, and a module-scope
  `React.memo` `ReaderParagraphBlock` (ref-based render closure + non-position render signature
  + active-verse-membership comparator). Follow-along math untouched.
- **P2 / APERF-06 — Unminified Android build (Critical).** No `expo-build-properties` → R8/ProGuard
  + resource shrinking OFF. Fix: add the plugin with `enableProguardInReleaseBuilds`,
  `enableShrinkResourcesInReleaseBuilds`, `hermesEnabled: true`, and inline `extraProguardRules`
  keep rules. **Mandatory stop-on-failure release smoke test** (minification can strip reflection
  classes). Inline rules only — `android/` is gitignored/regenerated.
- **P3 / APERF-02 — Scroll-collapse chrome on JS thread (High).** Dock gets a `useState` number,
  not the SharedValue; scroll handler writes state ~50×/collapse and fires `setOptions`/`setParams`
  per step. Fix: pass `readerBottomChromeProgressShared` to the dock, delete the per-step state path,
  gate tab-bar reconciliation to the discrete collapsed↔expanded flip.
- **P4 / APERF-04 — Non-virtualized plan list (High).** `PlanDetailScreen` renders up to 365
  `DayRow`s via `.map()` in a `ScrollView`. Fix: `FlashList` + memoized `DayRow` + header/footer.
- **P5 / APERF-05 — FieldCard overdraw (Medium).** Infinite `useNativeDriver:false` glow loop + 5
  gradients + 8 shadowed dots per card. Fix: native-driver the glow (+cleanup), Android-flat
  gradient fallback, drop per-dot shadows. iOS unchanged.
- **P6 / APERF-03 — Layout `bottom` animation (Medium).** Reader dock interpolates the layout
  `bottom` prop each frame. Fix: transform-only `translateY`, static base `bottom` set once.

### Cross-cutting constraints (locked)
- Expo **managed** workflow — no eject; **old RN architecture** (`newArchEnabled=false`) stays.
- House rules: `StyleSheet.create` only, `useTheme()` colors, i18n keys, discrete Zustand selectors.
- iOS behavior/appearance must be unchanged (Android-only fallbacks via `Platform`).
- **Execution order is constrained:** P1, P3, P6 all edit `BibleReaderScreen.tsx` and MUST run
  sequentially `P1 → P3 → P6` (never parallel). P4, P5, P2 are independent single-file tasks.
  Recommended order: P4 → P5 → P1 → P3 → P6 → P2 (P2's device smoke test validates everything).

### Claude's Discretion
- Whether to keep this as a single execution-plan doc handed to a cheap executor, or formalize into
  GSD `35-0X-PLAN.md` files via `/gsd:plan-phase 35`. The exact edits do not change either way.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Executable specification
- `.planning/phases/35-android-performance-hardening/35-EXECUTION-PLAN.md` — the verbatim
  find/replace edits + acceptance criteria for all six fixes (the source of truth)

### Audit evidence
- `.planning/notes/android-perf-audit-findings.md` — ranked findings, root causes, and the
  "already healthy / don't touch" list (Hermes on, FlashList migration done, cold-start optimized,
  no BlurView in use)
- `.planning/notes/android-perf-audit-prompt.md` — the audit goal/scope/constraints

### Primary files touched
- `src/screens/bible/BibleReaderScreen.tsx` (P1, P3, P6 — shared, sequential)
- `src/hooks/useAudioPosition.ts` (new), `src/hooks/index.ts`,
  `src/components/bible/HighlightedVerseText.tsx`, `src/components/audio/AudioPlayerBar.tsx` (P1)
- `src/components/audio/ReaderPlaybackDock.tsx` (P3)
- `src/screens/plans/PlanDetailScreen.tsx` (P4)
- `src/components/fourfields/FieldCard.tsx` (P5)
- `app.json`, `package.json` (P2)
- Source-assertion tests: `bibleReaderChromeSource.test.ts`, `readerPlaybackDockSource.test.ts`,
  `planDetailSource.test.ts`
</canonical_refs>

<specifics>
## Specific Ideas

- **TypeScript as a safety net (verified):** changing `ReaderPlaybackDock`'s prop to
  `SharedValue<number>` makes any missed `.value` conversion a compile error — `npm run typecheck`
  mechanically catches incomplete P3 edits.
- **Verification gate:** `npm run typecheck && npm run lint && npm run test:release`, plus the
  per-task source tests, then the P2 on-device release smoke pass (cold start + scroll + audio +
  download + Google sign-in + SVG screens).
- **Two human-eyeball risks:** (1) P1 follow-along highlight must still advance on device (the
  memoized cell skips position-tick re-renders); (2) P2 minification must not strip a reflection
  class — never ship the AAB if any smoke flow crashes.
</specifics>

<deferred>
## Deferred Ideas

- Audit P7–P10 (Low): AnnotationsScreen FlatList tuning props, remove dead `expo-blur` dep,
  recompress the 2.5 MB icon + Tibetan/plan PNGs, fix 3 no-selector `fourFieldsStore` subscriptions,
  memoize `NavigationContainer` theme + `TabNavigator` `screenOptions`.
- Shrinking the 44 MB bundled `bible-bsb-v2.db` (deferred off the critical path already).
</deferred>

---

*Phase: 35-android-performance-hardening*
*Context gathered: 2026-06-11 via codebase performance audit*
