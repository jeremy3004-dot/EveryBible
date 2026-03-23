---
phase: 22-gather-tab-waha-style-foundations-topics-meeting-format
plan: 02
subsystem: ui
tags: [react-native, navigation, i18n, zustand, expo]

# Dependency graph
requires:
  - phase: 22-01
    provides: GatherFoundation/GatherTopic types, gatherFoundations/gatherTopicCategories data, useGatherStore with progress tracking and banner state

provides:
  - Gather tab label (was Harvest) in all 4 locales (en, es, ne, hi)
  - Tab icon changed from leaf to people/people-outline
  - Updated LearnStackParamList: GatherHome, FoundationDetail, LessonDetail replacing old FourFields screens
  - GatherScreen with Foundations/Topics sub-tabs, info banners, navigation
  - Stub FoundationDetailScreen and LessonDetailScreen for navigation wiring

affects:
  - 22-03 (FoundationDetailScreen implementation)
  - 22-04 (LessonDetailScreen implementation)
  - any plan referencing LearnStackParamList or Learn tab navigation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Sub-tab bar pattern using local activeTab state and TouchableOpacity with underline indicator
    - Dismissable info banner using Zustand persistent state (infoBannerDismissed)
    - 2-column grid using flexWrap with computed width from useWindowDimensions

key-files:
  created:
    - src/screens/learn/GatherScreen.tsx
    - src/screens/learn/FoundationDetailScreen.tsx
    - src/screens/learn/LessonDetailScreen.tsx
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/locales/es.ts
    - src/i18n/locales/ne.ts
    - src/i18n/locales/hi.ts
    - src/navigation/tabManifest.ts
    - src/navigation/TabNavigator.tsx
    - src/navigation/types.ts
    - src/navigation/LearnStack.tsx
    - src/screens/learn/index.ts
    - src/screens/learn/CourseListScreen.tsx
    - src/screens/learn/CourseDetailScreen.tsx
    - src/screens/learn/LessonViewScreen.tsx
    - src/screens/learn/FourFieldsJourneyScreen.tsx
    - src/screens/learn/FourFieldsLessonViewScreen.tsx
    - src/screens/learn/FieldOverviewScreen.tsx

key-decisions:
  - "Orphaned FourFields screens kept in codebase but navigation types use any-cast to avoid compile errors — clean removal deferred to a dedicated cleanup plan"
  - "Topics sub-tab reuses infoBannerDismissed state from Foundations tab — single dismiss applies to both banners"
  - "FoundationDetailScreen and LessonDetailScreen created as minimal stubs — Plan 03 will implement full content"

patterns-established:
  - "Sub-tab navigation: local useState<'foundations' | 'topics'> + underline indicator, no library needed"
  - "Gather card pattern: icon container + content (number + title) + progress count in row layout"
  - "2-column topic grid: flexWrap + computed width = (screenWidth - 2*screenPadding - gap) / 2"

requirements-completed: [GATHER-01, GATHER-03]

# Metrics
duration: 25min
completed: 2026-03-23
---

# Phase 22 Plan 02: Gather Tab Rename + GatherScreen Summary

**Harvest tab renamed to Gather across 4 locales with people icon, navigation stack rewired to GatherHome/FoundationDetail/LessonDetail, and GatherScreen built with Foundations list and Topics grid matching Waha design**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-23T02:53:00Z
- **Completed:** 2026-03-23T03:18:59Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Tab label changed from "Harvest" to "Gather" in English, Spanish, Nepali, and Hindi with full gather translation section in EN/ES and minimal keys in NE/HI
- Tab icon updated from leaf to people/people-outline across all platforms
- LearnStackParamList rebuilt with GatherHome, FoundationDetail, LessonDetail replacing the old FourFields/CourseList screens
- GatherScreen renders Foundations sub-tab (vertical list with first card highlighted, info banner, progress counts) and Topics sub-tab (2-column grid by category)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename tab to Gather across i18n + navigation** - `87ddc20` (feat)
2. **Task 2: Build GatherScreen with Foundations and Topics sub-tabs** - `32fc836` (feat)

## Files Created/Modified

- `src/screens/learn/GatherScreen.tsx` - Main Gather screen with Foundations/Topics sub-tabs
- `src/screens/learn/FoundationDetailScreen.tsx` - Stub screen for foundation detail navigation
- `src/screens/learn/LessonDetailScreen.tsx` - Stub screen for lesson detail navigation
- `src/i18n/locales/en.ts` - Added `tabs.gather` and full `gather` translation section
- `src/i18n/locales/es.ts` - Added `tabs.gather: 'Reunir'` and Spanish `gather` section
- `src/i18n/locales/ne.ts` - Added `tabs.gather: 'भेला'` and minimal Nepali `gather` keys
- `src/i18n/locales/hi.ts` - Added `tabs.gather: 'इकट्ठा'` and minimal Hindi `gather` keys
- `src/navigation/tabManifest.ts` - Learn tab: labelKey to tabs.gather, icons to people/people-outline
- `src/navigation/TabNavigator.tsx` - Learn tab: t('tabs.gather')
- `src/navigation/types.ts` - LearnStackParamList updated, new screen prop types added
- `src/navigation/LearnStack.tsx` - Rewired to GatherHome as initial screen + FoundationDetail/LessonDetail stubs
- `src/screens/learn/index.ts` - Barrel exports updated to new screens

## Decisions Made

- Orphaned FourFields screens (FourFieldsJourneyScreen, FieldOverviewScreen, FourFieldsLessonViewScreen, CourseDetailScreen, LessonViewScreen) kept in codebase with `any` type casts to avoid TypeScript errors. These screens are no longer registered in LearnStack.tsx but still exist on disk. Clean removal deferred to a future cleanup plan to avoid scope creep.
- The dismissable info banner uses the same `infoBannerDismissed` state for both the Foundations and Topics tabs. This means dismissing either banner dismisses both — consistent with Waha's pattern where the banner is a one-time onboarding message.
- FoundationDetailScreen and LessonDetailScreen stubs created with minimal content (navigation back button only). Plan 03 will implement the full detail screen with lesson lists and meeting format content.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript errors in orphaned FourFields screens**
- **Found during:** Task 1 (navigation type updates)
- **Issue:** Removing FourFields types from LearnStackParamList caused TypeScript errors in 5 screens still referencing removed types (RouteProp, navigate calls, screen props)
- **Fix:** Updated orphaned screens to use `useRoute<any>()` with explicit param type assertions, replaced removed `navigate()` calls with `goBack()` placeholders, removed deleted type imports
- **Files modified:** FourFieldsJourneyScreen.tsx, FourFieldsLessonViewScreen.tsx, FieldOverviewScreen.tsx, CourseDetailScreen.tsx, LessonViewScreen.tsx
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `87ddc20` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix necessary for TypeScript compilation. Orphaned screens are now type-safe placeholders with no functional regression — they are simply unreachable via navigation.

## Known Stubs

- `src/screens/learn/FoundationDetailScreen.tsx` — placeholder screen; shows "Foundation Detail — coming in Plan 03" text. Navigated to from GatherScreen foundation card tap. Plan 03 will implement full foundation detail with lesson list and meeting format.
- `src/screens/learn/LessonDetailScreen.tsx` — placeholder screen; shows "Lesson Detail — coming in Plan 03" text. Navigated to from FoundationDetailScreen lesson row tap.

These stubs do not prevent the plan's goal (Gather tab + GatherScreen browsing) from being achieved. Foundation/Lesson detail content is Plan 03's scope.

## Issues Encountered

None beyond the orphaned screen type errors documented above.

## Next Phase Readiness

- GatherScreen is functional and browsable: tab shows with people icon, Foundations list renders 9 cards with progress, Topics grid renders all 5 categories
- FoundationDetailScreen stub accepts `foundationId` param and can be navigated to
- Plan 03 can implement FoundationDetailScreen with lesson list and meeting format sections
- Plan 03 can implement LessonDetailScreen with fellowship/story/application sections

---
*Phase: 22-gather-tab-waha-style-foundations-topics-meeting-format*
*Completed: 2026-03-23*
