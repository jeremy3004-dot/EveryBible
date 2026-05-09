---
status: resolved
trigger: "Find Plans icons/covers are not showing up in the iOS simulator."
created: "2026-05-09T14:47:12+05:45"
updated: "2026-05-09T14:53:48+05:45"
---

# Debug Session: Find Plans Icons Missing

## Symptoms

- Expected behavior: Find Plans should show visible plan cover artwork/icons on each plan card.
- Actual behavior: The plan cards appear to be missing their icons/covers in the simulator.
- Error messages: None reported yet.
- Timeline: Unknown; user noticed while reviewing the simulator.
- Reproduction: Open EveryBible on iOS simulator, navigate through onboarding if needed, open Plans tab, switch to Find Plans, inspect plan cards.

## Current Focus

- hypothesis: ""
- test: ""
- expecting: ""
- next_action: "complete"
- reasoning_checkpoint: "Root cause was the Find Plans cover asset map using bundled WebP files on the React Native Image require path; prior repo evidence shows this same iOS simulator failure mode for book icons. Converting plan covers to PNG and requiring PNG assets restores visible covers."
- tdd_checkpoint: ""

## Evidence

- timestamp: "2026-05-09T14:50:08+05:45"
  observation: "Docs discovery fallback found docs/bible-icons-fix.md documenting an earlier iOS/RN Image require issue where bundled WebP book icons did not appear reliably and were converted to PNG."
  source: "docs/bible-icons-fix.md"
- timestamp: "2026-05-09T14:50:08+05:45"
  observation: "Find Plans card renderer uses CoverImage -> getReadingPlanCoverSource(plan); the asset map points nearly every plan cover at assets/plans/covers/*.webp."
  source: "src/screens/plans/PlansHomeScreen.tsx; src/services/plans/readingPlanAssets.ts"
- timestamp: "2026-05-09T14:50:08+05:45"
  observation: "Added a red regression test requiring reading-plan cover requires to avoid WebP for iOS reliability; it fails against the current WebP asset map."
  source: "node --test --import tsx src/services/plans/readingPlanAssetsSource.test.ts"
- timestamp: "2026-05-09T14:53:48+05:45"
  observation: "Converted bundled plan cover WebP files to PNG and updated readingPlanAssets.ts to require PNG sources. Focused plan asset/share/background tests passed."
  source: "node --test --import tsx src/services/plans/readingPlanAssetsSource.test.ts src/data/shareVerseBackgroundsSource.test.ts src/data/readingPlans.generated.test.ts"
- timestamp: "2026-05-09T14:53:48+05:45"
  observation: "TypeScript check passed."
  source: "npm run typecheck"
- timestamp: "2026-05-09T14:53:48+05:45"
  observation: "Focused lint passed for changed TypeScript files."
  source: "npx eslint src/services/plans/readingPlanAssets.ts src/services/plans/readingPlanAssetsSource.test.ts"
- timestamp: "2026-05-09T14:53:48+05:45"
  observation: "Release simulator rebuild installed and launched on iPhone 17 Pro Max Fresh. Find Plans screen shows visible cover artwork for Daily Rhythms and Chronological plan cards."
  source: "npx expo run:ios --configuration Release --device \"iPhone 17 Pro Max Fresh\"; screenshot tmp/debug/app-launched.png"

## Eliminated

- Missing local catalog metadata: readingPlans.generated.ts provides cover keys for bundled plans.
- Missing files: assets/plans/covers contained the referenced WebP originals and now contains PNG counterparts.
- Supabase/catalog network dependency: docs/plans/2026-04-08-reading-plans-local-source-of-truth.md says mobile plan catalog and metadata are bundled locally.

## Resolution

- root_cause: Find Plans cover cards required bundled WebP plan images through React Native Image; the project already had evidence that this path is unreliable on the iOS simulator, causing covers/icons not to render.
- fix: Added PNG versions of plan cover assets and changed readingPlanAssets.ts to require PNG cover sources while preserving the existing cover keys and fallback behavior.
- verification: Focused regression/source tests passed, focused lint passed, npm run typecheck passed, and a rebuilt iOS simulator app showed visible Find Plans cover artwork.
- files_changed: src/services/plans/readingPlanAssets.ts; src/services/plans/readingPlanAssetsSource.test.ts; assets/plans/covers/*.png
