---
phase: 23-foundations-content-restructure
plan: 01
subsystem: ui
tags: [gather, foundations, discipleship, content, curriculum, dbs]

# Dependency graph
requires:
  - phase: 22-gather-tab-waha-style-foundations-topics-meeting-format
    provides: GatherFoundation type, gatherFoundations data structure, GatherScreen/FoundationDetailScreen/LessonDetailScreen consumers
provides:
  - 7 fully populated foundations with 67 lessons using single full-chapter Bible references
  - Authoritative curriculum content replacing placeholder data
  - Updated GatherFoundation.number type comment reflecting 7-foundation structure
affects:
  - GatherScreen
  - FoundationDetailScreen
  - LessonDetailScreen
  - gatherBibleService (full-chapter reference routing)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Full-chapter Bible references: omit startVerse/endVerse, provide only { bookId, chapter }"

key-files:
  created: []
  modified:
    - src/data/gatherFoundations.ts
    - src/types/gather.ts

key-decisions:
  - "Replace placeholder 9-foundation structure with authoritative 7-foundation curriculum; foundations 8 and 9 (Growing as a Jesus Community, Growing as Leaders) are removed entirely"
  - "Each lesson uses a single full-chapter reference with no verse ranges — simplifies audio/text routing and matches DBS meeting format"
  - "Foundation 7 renamed to 'Sharing the Good News' with megaphone-outline icon (was 'Growing as Disciples' with trending-up-outline)"

patterns-established:
  - "Full-chapter lesson references: { bookId, chapter } only — no startVerse/endVerse"

requirements-completed:
  - GATHER-01
  - GATHER-02

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 23 Plan 01: Foundations Content Restructure Summary

**7-foundation authoritative curriculum with 67 full-chapter lessons replaces 9-foundation placeholder in gatherFoundations.ts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T07:36:01Z
- **Completed:** 2026-03-23T07:38:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced 9-foundation placeholder (only Foundation 1 had lessons, all using verse ranges) with 7 fully populated foundations matching the authoritative curriculum spec
- All 67 lessons use single full-chapter references with no startVerse/endVerse — consistent with gatherBibleService full-chapter routing
- Removed foundations 8 (Growing as a Jesus Community) and 9 (Growing as Leaders) that no longer exist in the restructured curriculum
- Updated GatherFoundation.number comment from `// 1-9` to `// 1-7`

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace gatherFoundations data with authoritative 7-foundation, 67-lesson content** - `7f4434a` (feat)
2. **Task 2: Update GatherFoundation type comment and verify all consumers compile** - `2aac1b6` (chore)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/data/gatherFoundations.ts` - Complete rewrite: 7 foundations, 67 fully populated lessons with single full-chapter references, FELLOWSHIP_QUESTIONS and APPLICATION_QUESTIONS unchanged
- `src/types/gather.ts` - Updated GatherFoundation.number comment from `// 1-9` to `// 1-7`

## Decisions Made
- Replace placeholder 9-foundation structure with authoritative 7-foundation curriculum; foundations 8 and 9 removed entirely
- Each lesson uses a single full-chapter reference with no verse ranges — simplifies audio/text routing and matches DBS meeting format
- Foundation 7 renamed to "Sharing the Good News" with megaphone-outline icon (was "Growing as Disciples" with trending-up-outline)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The `node --test src/navigation/tabManifest.test.ts` command in the plan spec fails without `--import tsx` because TypeScript files need the tsx loader. The correct command is `node --test --import tsx src/navigation/tabManifest.test.ts`. Both tests passed with the correct invocation. This is an issue in the plan spec, not a code issue — TypeScript compiles cleanly and tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 7 foundations with 67 lessons are now populated and ready for rendering in GatherScreen, FoundationDetailScreen, and LessonDetailScreen
- gatherBibleService full-chapter routing (no startVerse/endVerse) aligns with the new reference structure
- Foundation content is complete; next steps would be UI polish, audio integration for lesson chapters, or additional curriculum phases

---
*Phase: 23-foundations-content-restructure*
*Completed: 2026-03-23*

## Self-Check: PASSED

- src/data/gatherFoundations.ts: FOUND
- src/types/gather.ts: FOUND
- .planning/phases/23-foundations-content-restructure/23-01-SUMMARY.md: FOUND
- Commit 7f4434a (Task 1): FOUND
- Commit 2aac1b6 (Task 2): FOUND
