---
phase: quick-260905-f0r
plan: "01"
subsystem: mobile-reader
completed: 2026-09-05
status: simulator_scope_verified
requirements: [M2-READ-01, M2-DESIGN-01]
tags: [reader, reanimated, liquid-glass, accessibility]
key-files:
  created:
    - src/stores/readerChromeStore.ts
    - src/navigation/TabBarSelection.tsx
    - src/navigation/readerTabBarMotion.ts
    - src/screens/bible/readerChromeMotion.ts
    - patches/expo-glass-effect+0.1.10.patch
  modified:
    - src/navigation/TabNavigator.tsx
    - src/navigation/tabBarCapsuleStyle.ts
    - src/hooks/useTabBarHeight.ts
    - src/screens/bible/BibleReaderScreen.tsx
    - src/components/audio/ReaderPlaybackDock.tsx
    - package.json
    - package-lock.json
    - ios/Podfile.lock
commit_scope: local main
---

# Reader controls and Liquid Glass parity

The corrected iPhone 17 Pro Max simulator Release build matches the second supplied recording's measured reader geometry and coordinated movement. The play button stays 64 points without a progress ring; its center moves from (220, 824) to (220, 889). The native glass capsule is 398×60 points at x 21, y 874. Arrow centers are (44, 836)/(396, 836), within one point of the reference.

## Implementation

- One UI-thread scroll calculation drives dock and root-tab motion continuously, including reversal. Owner checks protect shared progress from retained readers; chapter changes reset the appropriate offset. Overscroll and Reduced Motion have deterministic coverage.
- Native `expo-glass-effect` supplies supported iOS material; the existing blur/tint path remains for unsupported systems. A narrow patch guards Fabric-only child mounting methods for the existing legacy architecture. The native glass view is childless and has no fading ancestor.
- Logical capsule insets override React Navigation's start/end defaults. One neutral selection pill tracks the active tab.
- Chapter arrows, root tabs and animated top controls exclude touch/accessibility when hidden. Transport labels remain localized, and loading reports busy/disabled state.

## Verification

Final native build: `/tmp/eb-parity-ios-final-build.log` reports **BUILD SUCCEEDED**. Installed app: `/tmp/everybible-review2-ios/Build/Products/Release-iphonesimulator/EveryBible.app`. Target: isolated **iPhone 17 Pro Max simulator, iOS 26.5**. Source is the dirty `main` tree based on `a608f1d7dc138c3a171a09971760269a98188fe4`, not the clean commit alone.

Native evidence:

- `/tmp/eb-parity-evidence/final-expanded.png`
- `/tmp/eb-parity-evidence/final-collapsed.png`
- `/tmp/eb-parity-evidence/final-chapter-end.png` — final verse remains readable above the automatically restored controls.
- `/tmp/eb-parity-evidence/final-reader-motion.mp4` — 30.92 seconds, including a long idle interval.
- `/tmp/eb-parity-evidence/collapse-animation-frames.jpg` — inspected intermediate positions confirm coordinated movement.
- `/Users/dev/.codex/visualizations/2026/09/05/01a06f3e-c27f-75f2-b649-daca2dfc4fa1/everybible-reader-parity.mp4` — reviewable demo with only idle time removed; actual playback speed preserved.

Observed native checks passed: downward collapse, deep-scroll reversal/reveal, automatic chapter-end restoration at Matthew 25 verse 46, Matthew 25→26→25 chapter navigation, loading→pause→play control states, More→Bible scroll retention with expanded controls, and verse selection Done dismissal. The collapsed accessibility tree contains eight nodes and only one button, Play chapter audio, with no header/arrows/tabs.

Automated evidence:

| Check | Result |
| --- | --- |
| Final focused reader chrome/navigation subset | 77/77 passed |
| Locale coverage and actual rendering | 24/24 passed, covering all 21 bundled locales |
| Final maintained non-admin suite | 1586/1586 passed after all production/test changes; `/tmp/eb-parity-final-maintained-tests.log` |
| Final workspace lint and typechecks | Passed; one unrelated admin font warning |
| Final workspace tests | 1637/1638 passed; `/tmp/eb-parity-final-verify.log` |
| Final Android export | Passed; `/tmp/eb-parity-android-final-export.log`, output `/tmp/eb-parity-android-final` |
| Standalone Expo config | Passed; `/tmp/eb-parity-final-expo-config.log` |
| Owned source formatting | All 15 owned TS/TSX files passed Prettier check |

The only final workspace failure is concurrent unrelated admin WIP: `apps/admin/app/(dashboard)/analytics/page.test.ts`, “analytics explorer distinguishes global totals from linked geographic filters”, expects copy no longer present in the evolving admin component. The combined `release:verify` gate therefore did not pass or reach its trailing Expo config check; standalone Expo config verification subsequently passed. No unrelated admin changes were made for this task.

## Review corrections and limits

Native QA caught a full-width capsule that source-only geometry checks missed; logical start/end insets and an installed-React-Navigation composition regression fixed it. Review also closed missing hidden-control accessibility gates for tabs and top chrome. Final screenshots supersede the defective first-pass captures.

The requested simulator visual/control scope is verified. The broader verification remains **human_needed (3/4 must-haves)**: audible playback was not proven because the host audio probe was silent; physical VoiceOver, accessibility settings, theme/fallback appearance on Android or older iOS, plan completion and certain native edge cases remain unexercised. The exact tiny first scroll after refocus has unit coverage only; the attempted native gesture selected text instead. See `260905-f0r-VERIFICATION.md` for the complete evidence and limits.

The verified changes are saved to local main. Backend publishing and unrelated worktree cleanup are outside this change. The isolated simulator was shut down after saving its interaction trace at `/tmp/eb-parity-evidence/final-qa.ad`.
