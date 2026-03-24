---
phase: quick
plan: 260324-lvw
subsystem: i18n
tags: [i18n, translations, localization, screens, components, data-files]
dependency-graph:
  requires: []
  provides: [full-locale-parity-es-ne-hi, translated-screens, translated-data-keys]
  affects: [GatherScreen, LessonDetailScreen, BibleReaderScreen, GroupSessionScreen, GroupDetailScreen, MiniPlayer, PlaybackControls, ErrorBoundary]
tech-stack:
  added: []
  patterns: [t() calls in screens, i18n key lookup maps in data files, functional wrapper for class components]
key-files:
  created: []
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/locales/es.ts
    - src/i18n/locales/ne.ts
    - src/i18n/locales/hi.ts
    - src/screens/bible/BibleReaderScreen.tsx
    - src/screens/bible/BibleBrowserScreen.tsx
    - src/screens/learn/GroupSessionScreen.tsx
    - src/screens/learn/GroupDetailScreen.tsx
    - src/screens/learn/FourFieldsLessonViewScreen.tsx
    - src/screens/learn/LessonViewScreen.tsx
    - src/screens/learn/CourseDetailScreen.tsx
    - src/screens/learn/LessonDetailScreen.tsx
    - src/screens/learn/PrayerWallScreen.tsx
    - src/screens/learn/GatherScreen.tsx
    - src/screens/learn/FoundationDetailScreen.tsx
    - src/screens/learn/FieldOverviewScreen.tsx
    - src/screens/learn/FourFieldsJourneyScreen.tsx
    - src/components/audio/MiniPlayer.tsx
    - src/components/audio/PlaybackControls.tsx
    - src/components/ErrorBoundary.tsx
    - src/data/gatherFoundations.ts
    - src/data/gatherTopics.ts
    - src/data/fourFieldsCourses.ts
decisions:
  - Use functional wrapper ErrorFallback for class-based ErrorBoundary to access useTranslation hook
  - Store i18n key lookup maps (FOUNDATION_TITLE_KEYS, TOPIC_TITLE_KEYS, FIELD_TITLE_KEYS etc.) in data files and export them so render sites can share without duplication
  - Keep 200+ individual lesson titles in English per plan guidance — Bible story summary titles are cross-linguistically understood and adding 200+ locale keys per language would be unmaintainable
  - Build translated fellowship/application question arrays inline in LessonDetailScreen using t() rather than changing data arrays
  - Group new groups.session.* keys under nested object to match existing nesting patterns
metrics:
  duration: ~33 minutes
  completed: 2026-03-24
  tasks: 4
  files: 23
---

# Phase quick Plan 260324-lvw: Comprehensive i18n Audit and Fix Summary

Comprehensive i18n audit and fix: closed all translation parity gaps in es/ne/hi locale files, replaced all hardcoded user-facing strings in screens and components with t() calls, and wired static data files (gather foundations, topics, four fields) to use translation key resolution at render time.

## Tasks Completed

### Task 1: Close locale file parity gaps

Fixed all sections where es/ne/hi contained English fallback text:

- `profile.readingActivity` and all sub-keys (readingDays, chaptersRead, chapterRead, selectedDay, tapDayHint, noReadingActivityTitle/Body, firstReadAt, lastReadAt) — all 3 locales
- `readingPlans` section: title, browsePlans, myPlans, startPlan, enrolled, dayOf, markComplete, completed, progress, noPlans, noActivePlans, plus all 8 plan sub-objects with title+description — all 3 locales
- `annotations` section: full section including colors sub-object — all 3 locales
- `prayer` section: full section — all 3 locales
- `translations` section: full section — all 3 locales
- `harvest.syncedGroupsTitle/Description/Signin/noSyncedGroups/syncedLabel/loadingSyncedGroups/groupSyncLoadError/groupSyncPending` — all 3 locales
- `bible.manageAudio/audioDownloads/downloadBibleAudio/audioSavedOffline/audioDownloadFailed` — all 3 locales
- `more.readingActivity` — all 3 locales
- `gather.infoBanner/topicsBanner/getStarted/foundationLabel/showMore/showLess/sendInvitation/gatherWithOthers/invitationDescription/upNext/shareAudio/shareText/shareLink/download/removeDownload/markComplete/completed/markIncomplete/manageBookmarks/lessonComplete` — ne/hi

### Task 2: Replace hardcoded strings in screens and components

New translation key sections added to all 4 locale files:
- `audio.nowPlaying/readyToResume/repeatChapter/repeatBook/repeatOff/showText`
- `common.unexpectedError/somethingWentWrong/tryAgain/shareMessage`
- `bible.verseCount_one/verseCount_other/listen/read/removeFromFavorites/addToFavorites/addToSavedPlaylist/addToQueue/downloadBookAudio/shareChapterReference`
- `harvest.completeAndContinue/completeLesson/studies/chapters/nowReading/openAndPlay/chapterStudiesSubtitle/chapterStudiesBody`
- `groups.*` — entire new section: session, syncSession, member management strings
- `prayer.you/groupMember`

Files updated:
- **MiniPlayer.tsx**: 'Now playing' / 'Ready to resume' → t()
- **PlaybackControls.tsx**: repeat accessibility labels → t()
- **BibleReaderScreen.tsx**: verse count, Listen/Read mode labels, 6 overflow menu labels → t(), showTextLabel prop → t()
- **BibleBrowserScreen.tsx**: 'Berean Standard Bible' fallback, 'Old/New Testament' → t()
- **GroupSessionScreen.tsx**: full session content, error states, all phase titles/questions → t(); added useTranslation
- **GroupDetailScreen.tsx**: error states, leave group alert, member UI, progress text → t(); added useTranslation
- **FourFieldsLessonViewScreen.tsx**: complete button → t()
- **LessonDetailScreen.tsx**: share message → t(); 'Lesson not found' → t()
- **PrayerWallScreen.tsx**: 'You' / 'Group member' → t()
- **LessonViewScreen.tsx**: 'Mark as Complete' button → t(); added useTranslation
- **CourseDetailScreen.tsx**: UI chrome labels → t(); added useTranslation
- **ErrorBoundary.tsx**: added ErrorFallback functional wrapper with t() calls

### Task 3: Wire static data files to i18n keys

New lookup maps exported from data files:
- `gatherFoundations.ts`: `FOUNDATION_TITLE_KEYS`, `FOUNDATION_DESC_KEYS`
- `gatherTopics.ts`: `CATEGORY_NAME_KEYS`, `TOPIC_TITLE_KEYS`
- `fourFieldsCourses.ts`: `FIELD_TITLE_KEYS`, `FIELD_SUBTITLE_KEYS`, `FIELD_DESC_KEYS`

New keys added to all 4 locale files:
- `gather.fellowship/applicationQ1-Q7` (fellowship and application questions translated)
- `gather.foundation1-7Title/Desc` (7 foundation titles + descriptions)
- `gather.category*` (5 category names)
- `gather.topic*` (26 topic titles)
- `fields.entry/gospel/discipleship/church/multiplication Title/Subtitle/Desc` (15 field keys)

Render sites updated:
- **GatherScreen.tsx**: foundation titles, category names, topic titles → t() via key maps
- **FoundationDetailScreen.tsx**: foundation title, description, nextFoundation title → t()
- **LessonDetailScreen.tsx**: FELLOWSHIP_QUESTIONS and APPLICATION_QUESTIONS replaced with translated arrays built from t() calls; 'Read the Story →' → t()
- **FieldOverviewScreen.tsx**: field title, subtitle, description → t()
- **FourFieldsJourneyScreen.tsx**: field pill title → t()
- **FourFieldsLessonViewScreen.tsx**: field badge title → t()
- **GroupSessionScreen.tsx**: field badge title → t()
- **GroupDetailScreen.tsx**: field badge title → t()

Individual lesson titles (200+ Bible story summaries across foundations and topics) intentionally kept in English — see Decisions section.

### Task 4: Final parity verification and lint pass

- Ran TypeScript compile: zero errors
- Fixed handleShare useCallback missing `t` dependency
- Removed unused FELLOWSHIP_QUESTIONS/APPLICATION_QUESTIONS imports from LessonDetailScreen
- Fixed incorrect topic IDs in TOPIC_TITLE_KEYS map (6 IDs corrected)
- Remaining lint items are all pre-existing: HomeScreen `any` type, LessonDetailScreen setState-in-effect pattern, Deno supabase function errors — none introduced by this plan

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incorrect topic IDs in TOPIC_TITLE_KEYS map**
- **Found during:** Task 4 final verification
- **Issue:** Topic IDs guessed during Task 3 didn't match actual data file IDs (topic-self-esteem vs topic-known-loved, topic-money-and-god vs topic-money-god, etc.)
- **Fix:** Verified actual IDs from gatherTopics.ts and corrected 6 entries in TOPIC_TITLE_KEYS
- **Files modified:** src/data/gatherTopics.ts
- **Commit:** 26680a5

**2. [Rule 2 - Missing critical] Add t to useCallback dependency array**
- **Found during:** Task 4 lint pass
- **Issue:** handleShare useCallback in LessonDetailScreen used t() but didn't list t in deps array
- **Fix:** Added t to dependency array
- **Files modified:** src/screens/learn/LessonDetailScreen.tsx
- **Commit:** 76f6736

### Architectural Note

The plan originally specified storing i18n keys as the data values in gatherFoundations.ts, gatherTopics.ts, and fourFieldsCourses.ts. After reviewing the TypeScript types and render sites, a cleaner approach was chosen: export ID-to-key lookup maps from each data file and resolve via t() in render sites. This keeps the data types intact and avoids ripple effects on consumers that read `.title` directly for non-display purposes (accessibility labels, share messages, etc.).

## Known Stubs

The following stubs exist in files touched by this plan but were not wired to real data because the screens are placeholder/unfinished:

| File | Location | Description | Reason |
|------|----------|-------------|--------|
| src/screens/learn/LessonViewScreen.tsx | Lines 31-79 | Entire lesson body content ("What is the Bible?", key points, scripture quote) is hardcoded placeholder | LessonViewScreen is an orphaned stub screen not connected to real lesson data |
| src/screens/learn/CourseDetailScreen.tsx | Lines 15-23 | `sampleLessons` array with 8 hardcoded placeholder lesson titles | CourseDetailScreen is a stub screen with placeholder data; comment in code says "LessonView removed — orphaned screen pending migration" |

These stubs do not prevent this plan's goal (i18n compliance across all active screens) since these screens are not in the active navigation flow.

## Self-Check: PASSED

Key files verified to exist:
- src/i18n/locales/en.ts: FOUND
- src/i18n/locales/es.ts: FOUND
- src/i18n/locales/ne.ts: FOUND
- src/i18n/locales/hi.ts: FOUND
- src/data/gatherFoundations.ts: FOUND
- src/data/gatherTopics.ts: FOUND
- src/data/fourFieldsCourses.ts: FOUND

Commits verified:
- 4e8db7b: Task 1 - close locale parity gaps
- 0f4b0f4: Task 2 - replace hardcoded strings
- 32fc432: Task 3 - wire static data files
- 76f6736: Task 4 fix - handleShare dependency
- 26680a5: Task 4 fix - topic IDs
