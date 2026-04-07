---
phase: 18
plan: 02
subsystem: navigation
tags: [navigation, tabs, i18n, reading-plans, react-navigation]
dependency-graph:
  requires: [18-01]
  provides: [PlansStack, Plans tab, PlansHomeScreen, PlanDetailScreen]
  affects: [LearnStack, TabNavigator, CourseListScreen, ReadingPlanDetailScreen, ReadingPlanListScreen]
tech-stack:
  added: []
  patterns: [cross-tab navigation via rootNavigationRef, lazy getComponent pattern, wrapper component forwarding props]
key-files:
  created:
    - src/navigation/PlansStack.tsx
    - src/screens/plans/PlansHomeScreen.tsx
    - src/screens/plans/PlanDetailScreen.tsx
  modified:
    - src/navigation/types.ts
    - src/navigation/TabNavigator.tsx
    - src/navigation/tabManifest.ts
    - src/navigation/tabBarVisibility.ts
    - src/navigation/LearnStack.tsx
    - src/navigation/tabManifest.test.ts
    - src/screens/learn/ReadingPlanDetailScreen.tsx
    - src/screens/learn/ReadingPlanListScreen.tsx
    - src/screens/learn/CourseListScreen.tsx
    - src/i18n/locales/en.ts
    - src/i18n/locales/es.ts
    - src/i18n/locales/ne.ts
    - src/i18n/locales/hi.ts
decisions:
  - ReadingPlanDetailScreen refactored to accept planId+navigation as required props instead of reading from useRoute; PlanDetailScreen wrapper forwards PlansStack route params to it
  - ReadingPlanListScreen navigation to ReadingPlanDetail migrated to rootNavigationRef.navigate('Plans', {screen: 'PlanDetail', params: {planId}}) since LearnStack no longer hosts those routes
metrics:
  duration: 12m
  completed: 2026-04-07
  tasks: 4
  files: 13
---

# Phase 18 Plan 02: Navigation Wiring, Tab Addition, and i18n Keys Summary

Plans tab added to the bottom navigation with a PlansStack navigator, placeholder PlansHomeScreen (segmented control + 4 tabs), and a PlanDetailScreen wrapper that forwards planId from PlansStack route params into the existing ReadingPlanDetailScreen component.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Add i18n keys to all 4 locale files | 125969a |
| 2 | Update navigation types | dde88b6 |
| 3 | Create PlansStack navigator and placeholder screens | dde88b6 |
| 4 | Wire Plans tab into TabNavigator and clean up LearnStack | dde88b6 |

## What Was Built

- **5th "Plans" tab** positioned between Learn and More in the bottom nav (calendar icon)
- **PlansStack.tsx** — native stack navigator for the Plans tab using lazy `getComponent` pattern
- **PlansHomeScreen.tsx** — placeholder screen with `screenTitle` header and horizontally scrollable segmented control (My Plans / Find Plans / Saved / Completed). Full content wired in Plan 18-03.
- **PlanDetailScreen.tsx** — thin wrapper in Plans stack; passes `route.params.planId` and `navigation` as props to `ReadingPlanDetailScreen`
- **ReadingPlanDetailScreen** refactored — now accepts `planId` and `navigation` as required props instead of calling `useRoute()`/`useNavigation()` internally; eliminates the LearnStack route dependency
- **ReadingPlanListScreen** fixed — `navigation.navigate('ReadingPlanDetail', ...)` replaced with `rootNavigationRef.navigate('Plans', {screen: 'PlanDetail', ...})`
- **CourseListScreen** updated — Reading Plans card cross-navigates to Plans tab via `rootNavigationRef`
- **tabBarVisibility** — `PlanDetail` added to hidden routes so tab bar hides inside plan detail
- **i18n** — 11 new `readingPlans.*` keys + `tabs.plans` key added across en/es/ne/hi

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ReadingPlanListScreen broken navigation after LearnStack cleanup**
- **Found during:** Task 4 typecheck
- **Issue:** `ReadingPlanListScreen` still referenced `ReadingPlanList` key (removed from `LearnStackParamList`) and called `navigation.navigate('ReadingPlanDetail', ...)` which no longer exists in any stack
- **Fix:** Removed `NavProp` type alias, added `rootNavigationRef` import, replaced both `navigation.navigate` calls with `rootNavigationRef.navigate('Plans', {screen: 'PlanDetail', params: {planId}})`; restored `useNavigation()` only for `navigation.goBack()` in the screen header
- **Files modified:** `src/screens/learn/ReadingPlanListScreen.tsx`
- **Commit:** dde88b6

**2. [Rule 1 - Bug] Updated tabManifest.test.ts to reflect 5-tab order**
- **Found during:** Test run after Task 4
- **Issue:** Test asserted `['Home', 'Bible', 'Learn', 'More']` — no longer correct
- **Fix:** Updated assertion to `['Home', 'Bible', 'Learn', 'Plans', 'More']` with updated description
- **Files modified:** `src/navigation/tabManifest.test.ts`
- **Commit:** a0144c7

## Known Stubs

- **PlansHomeScreen.tsx** — tab content sections (my-plans, find-plans, saved, completed) render only a `Text` showing the active tab key. This is intentional — Plan 18-03 will wire the actual content.

## Self-Check: PASSED

- src/navigation/PlansStack.tsx — FOUND
- src/screens/plans/PlansHomeScreen.tsx — FOUND
- src/screens/plans/PlanDetailScreen.tsx — FOUND
- .planning/phases/18-reading-plans/18-02-SUMMARY.md — FOUND
- Commit 125969a — FOUND
- Commit dde88b6 — FOUND
- Commit a0144c7 — FOUND
