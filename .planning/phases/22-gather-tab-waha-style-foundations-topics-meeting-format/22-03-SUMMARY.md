---
phase: 22-gather-tab-waha-style-foundations-topics-meeting-format
plan: "03"
subsystem: ui
tags: [react-native, gather, foundation-detail, bottom-sheet, modal, zustand, i18n]

requires:
  - phase: 22-gather-tab-waha-style-foundations-topics-meeting-format
    plan: "01"
    provides: GatherFoundation/GatherLesson types, gatherFoundations data, gatherStore
  - phase: 22-gather-tab-waha-style-foundations-topics-meeting-format
    plan: "02"
    provides: FoundationDetail navigation route, LearnStackParamList types, GatherScreen navigation pattern

provides:
  - FoundationDetailScreen with Waha-style hero, expandable description, invitation card, numbered lesson list, and up-next navigation
  - LessonBottomSheet component with share (audio/text/link), mark complete/incomplete, download placeholder, and bookmarks placeholder
  - src/components/gather/ directory with barrel export

affects: [22-04-PLAN, LessonDetailScreen, GatherScreen integration, Gather tab full flow]

tech-stack:
  added: []
  patterns:
    - Union-type resolution: gatherFoundations.find ?? gatherTopicCategories.flatMap().find() for handling both foundations and topics by a single foundationId param
    - Type guard pattern: 'description' in foundation to safely access GatherFoundation-only fields on GatherFoundation | GatherTopic union
    - Bottom sheet via Modal with transparent backdrop and onPress on inner TouchableOpacity to absorb taps

key-files:
  created:
    - src/screens/learn/FoundationDetailScreen.tsx
    - src/components/gather/LessonBottomSheet.tsx
    - src/components/gather/index.ts
  modified:
    - src/components/index.ts

key-decisions:
  - "FoundationDetailScreen handles both foundations and topics through the same foundationId param, resolving via a find-then-flatMap chain rather than separate screens"
  - "GatherTopic does not have a description field; used 'description' in foundation type guard to conditionally show the expandable description section"
  - "LessonBottomSheet uses React Native Modal (not a third-party lib) to keep within Expo managed workflow constraints"

patterns-established:
  - "GatherTopic vs GatherFoundation type narrowing: use 'in' operator to check for foundation-only fields before accessing"
  - "Bottom sheet pattern: Modal transparent with backdrop TouchableOpacity + inner sheet TouchableOpacity absorbing taps"
  - "gather components barrel: src/components/gather/ exports via index.ts, re-exported from src/components/index.ts"

requirements-completed: [GATHER-02, GATHER-04]

duration: 20min
completed: 2026-03-23
---

# Phase 22 Plan 03: Foundation Detail Screen and Lesson Bottom Sheet Summary

**Waha-style FoundationDetailScreen with expandable hero, invitation share, numbered lesson list with completion badges, and a six-action LessonBottomSheet that toggles mark complete and shares via native Share API**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-23
- **Completed:** 2026-03-23
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- FoundationDetailScreen renders hero icon (80px circle), progress text, foundation label, large bold title, and expandable description with Show More/Less toggle
- Send invitation card with native Share.share() and "Gather with others" CTA button
- Numbered lesson rows with accent-colored completion badges, three-dot menu triggering the bottom sheet, and tap-to-navigate to LessonDetail
- Up next card at the bottom navigating to the next sequential foundation via navigation.push
- LessonBottomSheet (Modal-based) with six action rows: share audio, share text, share link, download (deferred), mark complete/incomplete, manage bookmarks (deferred)
- Both foundation IDs and topic IDs resolve correctly via union find chain
- Barrel export: src/components/gather/ with index.ts, re-exported from main components/index.ts

## Task Commits

Each task was committed atomically:

1. **Task 2: Build LessonBottomSheet component** - `2fab8e4` (feat)
2. **Task 1: Build FoundationDetailScreen** - `4a2e955` (feat)

**Plan metadata:** (docs commit follows)

_Note: Task 2 (LessonBottomSheet) was committed before Task 1 (FoundationDetailScreen) because Task 1 imports Task 2. Both tasks required for TypeScript to compile cleanly._

## Files Created/Modified
- `src/screens/learn/FoundationDetailScreen.tsx` - Full Waha-style foundation/topic detail screen with hero, description, invitation card, lesson list, bottom sheet, and up-next card
- `src/components/gather/LessonBottomSheet.tsx` - Slide-up modal bottom sheet with six lesson action rows
- `src/components/gather/index.ts` - Barrel export for gather components
- `src/components/index.ts` - Added `export * from './gather'`

## Decisions Made
- **Single screen for foundations and topics:** Used foundationId param to resolve either a GatherFoundation (from gatherFoundations) or a GatherTopic (from gatherTopicCategories.flatMap). Avoids duplicating the detail screen for two nearly identical layouts.
- **Type guard for description:** GatherTopic has no `description` field. Used `'description' in foundation` to safely show the expandable description block only for foundations (and any future topic that adds a description).
- **Modal-based bottom sheet:** Used React Native's built-in `Modal` component rather than adding a third-party library (react-native-bottom-sheet, etc.) to stay within the Expo managed workflow and keep bundle size down.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript union type error on description access**
- **Found during:** Task 1 (FoundationDetailScreen TypeScript verification)
- **Issue:** `GatherFoundation | GatherTopic` union type — `description` only exists on `GatherFoundation`, causing TS2339 error
- **Fix:** Changed `foundation.description` access to `'description' in foundation && !!foundation.description` type guard
- **Files modified:** src/screens/learn/FoundationDetailScreen.tsx
- **Verification:** `npx tsc --noEmit` passes with zero src/ errors
- **Committed in:** 4a2e955 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 type bug)
**Impact on plan:** Type narrowing fix was essential for TypeScript strict-mode correctness. No scope creep.

## Issues Encountered
- `LessonBottomSheet` module not found during Task 1 verification since it was created in Task 2. Resolved by creating the bottom sheet component file first, then TypeScript compiled both files cleanly together.

## Known Stubs
- **Download action** in LessonBottomSheet (`handleDownload`): no-op, just calls `onClose()`. Deferred — no local download infrastructure exists yet.
- **Manage Bookmarks action** in LessonBottomSheet (`handleManageBookmarks`): no-op, just calls `onClose()`. Deferred — bookmarks feature (Phase 17) not yet implemented.
- These stubs do NOT prevent the plan's stated goal (foundation detail with lesson list + bottom sheet actions) from being achieved. The UI presents these rows to match the Waha reference; their backend functionality is gated on future phases.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FoundationDetailScreen and LessonBottomSheet are complete and fully wired to gatherStore completion tracking
- LessonDetail screen (plan 04) can now be built knowing the navigation params: `{ parentId, lessonId, parentType }`
- Topics detail works via the same screen (foundationId starts with 'topic-') — no separate screen needed
- All gather.* i18n keys used in this plan were already present from plan 02

---
*Phase: 22-gather-tab-waha-style-foundations-topics-meeting-format*
*Completed: 2026-03-23*

## Self-Check: PASSED

- FOUND: src/screens/learn/FoundationDetailScreen.tsx
- FOUND: src/components/gather/LessonBottomSheet.tsx
- FOUND: src/components/gather/index.ts
- FOUND: .planning/phases/22-gather-tab-waha-style-foundations-topics-meeting-format/22-03-SUMMARY.md
- FOUND: commit 2fab8e4 (LessonBottomSheet)
- FOUND: commit 4a2e955 (FoundationDetailScreen)
- FOUND: commit a682bf5 (docs metadata)
- TypeScript: zero src/ errors (`npx tsc --noEmit` clean)
