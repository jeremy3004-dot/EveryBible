# Testing

## Test Stack

- Test command: `npm test`
- Runner: Node built-in test runner with `tsx`
- Script source: [`package.json`](/Users/dev/Projects/EveryBible/package.json)
- No Jest, Detox, or React Native Testing Library is currently configured in dependencies

## Test File Placement

- Tests are colocated with implementation and follow `*.test.ts`
- Current examples include:
- [`src/services/audio/audioDownloadService.test.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioDownloadService.test.ts)
- [`src/services/auth/googleSignIn.test.ts`](/Users/dev/Projects/EveryBible/src/services/auth/googleSignIn.test.ts)
- [`src/services/bible/presentation.test.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.test.ts)
- [`src/services/startup/startupService.test.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.test.ts)
- [`src/services/sync/syncMerge.test.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.test.ts)
- [`src/stores/persistedStateSanitizers.test.ts`](/Users/dev/Projects/EveryBible/src/stores/persistedStateSanitizers.test.ts)
- [`src/config/iosSplashAssetPlugin.test.ts`](/Users/dev/Projects/EveryBible/src/config/iosSplashAssetPlugin.test.ts)

## What Is Covered Well

- Pure or mostly pure service helpers
- Data transformation logic
- Startup coordinator behavior
- State sanitization and migration behavior
- Audio download orchestration with fake file-system adapters
- Auth configuration helpers
- Locale and onboarding selection logic

## Test Style

- Tests use `node:test` plus `node:assert/strict`
- Dependencies are commonly injected or faked inline instead of using a mocking framework
- Modules are designed for testability through helper extraction, for example:
- startup dependency injection in [`src/services/startup/startupService.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.ts)
- Google config resolver in [`src/services/auth/googleSignIn.ts`](/Users/dev/Projects/EveryBible/src/services/auth/googleSignIn.ts)
- sync merge helpers in [`src/services/sync/syncMerge.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.ts)

## What Is Not Covered Much

- Screen rendering and user interaction flows
- Navigation integration
- End-to-end auth flows on device
- Native behaviors such as Apple Sign-In, notifications, audio session behavior, or app icon switching
- Live Supabase integration behavior beyond client construction
- Release-path checks for EAS builds and native startup regressions

## Risk Areas For Future Test Expansion

- Startup path in [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx)
- Sync orchestration in [`src/hooks/useSync.ts`](/Users/dev/Projects/EveryBible/src/hooks/useSync.ts)
- Group study UI and backend handoff in [`src/screens/learn/`](/Users/dev/Projects/EveryBible/src/screens/learn) and [`src/services/groups/groupService.ts`](/Users/dev/Projects/EveryBible/src/services/groups/groupService.ts)
- Bible reader presentation and audio affordances in [`src/components/audio/`](/Users/dev/Projects/EveryBible/src/components/audio) and [`src/screens/bible/`](/Users/dev/Projects/EveryBible/src/screens/bible)

## Practical Notes

- Current tests are fast and lightweight because they stay near pure logic
- Colocation makes it easy to discover test intent while editing a feature
- There is no visible coverage reporting or CI-specific affected-test selection in this repo yet
- If the team starts shipping more native or release-sensitive work, device-level testing will become more important than additional unit tests alone
