# Phase 04 Research

## Summary

Phase 4 is primarily an integration problem, not a greenfield feature build. The repo already contains a full `LearnStack`, Four Fields lesson screens, and both local and synced group-study models. The most immediate product gap is that none of that learn/disciple work is mounted in the active root shell, so the live app currently hides the discipleship surface entirely.

## Key Findings

### Learn Surface Exists But Is Unreachable

- The active app shell mounts `TabNavigator` from `RootNavigator`, and the bottom tab navigator currently exposes only `Home`, `Bible`, and `More`.
- `LearnStack` already exists and wires `CourseList`, `CourseDetail`, `LessonView`, `FourFieldsJourney`, `FieldOverview`, `FourFieldsLessonView`, `GroupList`, `GroupDetail`, and `GroupSession`.
- The result is that DISC-01 is mostly blocked by root-shell wiring, not by missing lesson screens.

Relevant files:
- `App.tsx`
- `src/navigation/RootNavigator.tsx`
- `src/navigation/TabNavigator.tsx`
- `src/navigation/LearnStack.tsx`
- `src/navigation/types.ts`

### Four Fields / Lesson Content Is Already Product-Ready Enough For Initial Exposure

- `CourseListScreen` already acts like a feature landing page with progress, next lesson, Four Fields CTA, and a group-preview CTA.
- `FourFieldsJourneyScreen`, `FieldOverviewScreen`, `FourFieldsLessonViewScreen`, `CourseDetailScreen`, and `LessonViewScreen` are present and navigable within `LearnStack`.
- Existing translation keys already include a `tabs.harvest` label, so the live shell can expose this surface without new localization work.

Relevant files:
- `src/screens/learn/CourseListScreen.tsx`
- `src/screens/learn/FourFieldsJourneyScreen.tsx`
- `src/screens/learn/FieldOverviewScreen.tsx`
- `src/screens/learn/FourFieldsLessonViewScreen.tsx`
- `src/screens/learn/CourseDetailScreen.tsx`
- `src/screens/learn/LessonViewScreen.tsx`
- `src/i18n/locales/en.ts`

### Group Study Is Split Between Local State And Unused Synced Services

- Local group state lives in `useFourFieldsStore` and includes creation, join, leave, lesson progression, notes, and local group progress persistence.
- Separate Supabase-backed group services already exist for listing, creating, joining, leaving, updating lessons, and recording group sessions.
- The current learn screens use only the local `useFourFieldsStore` path. They do not yet consume the synced group services.
- `CourseListScreen` and `FourFieldsJourneyScreen` currently hide the group-preview CTA when `config.features.studyGroupsSync` is enabled, which suggests the phase should avoid a naive “flip the sync flag on” approach until the screens are reconciled.

Relevant files:
- `src/stores/fourFieldsStore.ts`
- `src/types/course.ts`
- `src/services/groups/groupService.ts`
- `src/services/groups/index.ts`
- `src/screens/learn/GroupListScreen.tsx`
- `src/screens/learn/GroupDetailScreen.tsx`
- `src/screens/learn/GroupSessionScreen.tsx`
- `src/screens/learn/CourseListScreen.tsx`
- `src/screens/learn/FourFieldsJourneyScreen.tsx`

## Recommended Execution Order

1. `04-01`: Mount the existing learn/disciple surface in the active root shell with the smallest possible navigation change.
2. `04-02`: Introduce a clear adapter or source-selection layer between local groups and synced groups so the app stops pretending there is only one group model.
3. `04-03`: Validate group-session capture and Supabase-backed permissions after the navigation and state-source story are coherent.
