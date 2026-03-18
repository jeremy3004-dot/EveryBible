# Phase 6 Research

## Objective

Add three high-leverage improvements without destabilizing the current release path:

1. Parse typed scripture references from the live Bible search field.
2. Improve responsiveness on the heaviest Bible list surfaces with FlashList.
3. Surface reading momentum with a calendar view backed by existing progress data.

## Evidence From Current Code

- `src/screens/bible/BibleBrowserScreen.tsx` is the only live free-text Bible entry point, so passage parsing belongs there rather than in a new screen.
- `src/screens/bible/bibleSearchModel.ts` already centralizes query-threshold logic and is the right seam for classifying typed references versus full-text search.
- `src/navigation/types.ts` and `src/screens/bible/BibleReaderScreen.tsx` already support the navigation contract we need: `bookId`, `chapter`, and optional `focusVerse`.
- `src/stores/progressStore.ts` already persists chapter read timestamps, streak days, and read-date summaries, which is enough for a first reading-activity calendar.
- `src/screens/more/ProfileScreen.tsx` and the More stack already host personal progress UI, so a reading-activity entry point belongs there.
- `src/screens/bible/ChapterSelectorScreen.tsx` and `src/screens/bible/BibleReaderScreen.tsx` are the highest-value Bible surfaces for FlashList based on current list/render patterns.

## Dependency Choice

### `bible-passage-reference-parser`

- License: MIT
- Use only as a parsing/normalization layer.
- Map parser book output into the app's internal `bookId` values from `src/constants/books.ts`.
- Constrain v1 behavior to the current reader contract:
  - single chapter navigation
  - optional focused verse
  - multi-chapter and complex range input opens at the first navigable chapter/verse

### `@shopify/flash-list`

- License: MIT
- Use first where list pressure is highest and behavior is already list-like.
- Prefer conservative migrations that preserve current UI contracts:
  - `ChapterSelectorScreen`
  - `BibleBrowserScreen` search/results lists
- Avoid destabilizing manual verse-focus scroll behavior in `BibleReaderScreen` until the simpler surfaces are proven.

### `react-native-calendars`

- License: MIT
- Scope v1 to a read-only activity calendar.
- Do not introduce reading-plan authoring, plan recovery, or reminder changes in this phase.
- Use current local progress data first; if true daily history is needed, add the smallest date-keyed activity map that does not redefine existing `chaptersRead` semantics.

## Product Guardrails

- Keep the parser inline with search so users gain speed without learning a new entry surface.
- Keep the calendar in More/Profile so it strengthens retention without crowding the Home screen.
- Keep FlashList adoption incremental so we improve responsiveness without opening a wide UI-regression front.

## Implementation Notes

- Add tests before implementation for:
  - reference parsing and normalization
  - search-model branching between reference and full-text
  - reading-activity aggregation
- If calendar fidelity requires date-keyed history, extend store persistence in a backward-compatible way and keep sync changes minimal unless clearly necessary.
- Preserve existing route names and navigation contracts unless a failing test proves expansion is necessary.
