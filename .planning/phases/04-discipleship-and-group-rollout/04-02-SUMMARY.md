# Plan 02 Summary

## Outcome

The learn surface now preserves local study groups even when synced-group rollout flags or backend readiness change, and it stops implying that local and synced groups are already one unified system. Local groups stay fully usable on-device, while synced groups are exposed only through an honest read-only surface that reflects real auth and backend readiness.

## Changes

- Added `src/services/groups/groupRepository.ts` plus `src/services/groups/groupRepository.test.ts` as the read-side adapter for repository list/detail snapshots across local and synced group models.
- Added `src/screens/learn/groupRolloutModel.ts` plus `src/screens/learn/groupRolloutModel.test.ts` so learn-entry rollout messaging distinguishes pending rollout, sign-in-required, and ready-for-sync states without hiding the group surface.
- Updated `src/screens/learn/CourseListScreen.tsx` and `src/screens/learn/FourFieldsJourneyScreen.tsx` so the study-group entry stays reachable even when synced groups are not enabled for the current build.
- Updated `src/screens/learn/GroupListScreen.tsx` and `src/screens/learn/GroupDetailScreen.tsx` to separate preserved local groups from synced-account groups, load synced read models only when config/auth allow it, and keep synced detail surfaces read-only until session capture is verified.
- Expanded harvest rollout copy in `src/i18n/locales/*.ts` so the new status and synced-group labels preserve the shared translation keyset across all supported locales.

## Verification

- `node --test --import tsx src/navigation/tabManifest.test.ts src/screens/learn/groupRolloutModel.test.ts src/services/groups/groupRepository.test.ts`
- `npx eslint src/screens/learn/CourseListScreen.tsx src/screens/learn/FourFieldsJourneyScreen.tsx src/screens/learn/GroupListScreen.tsx src/screens/learn/GroupDetailScreen.tsx src/screens/learn/groupRolloutModel.ts src/screens/learn/groupRolloutModel.test.ts src/services/groups/groupRepository.ts src/services/groups/groupRepository.test.ts src/services/groups/index.ts src/i18n/locales/*.ts`
- `npm test`

## Remaining Manual Checks

- On a release-like build with synced groups disabled, confirm local groups remain reachable from both learn entrypoints and still open their local detail/session surfaces.
- On a build with backend config and signed-in auth available, confirm the group list surfaces synced groups separately from local ones and that synced detail screens stay clearly read-only.
- Verify the new synced/local status copy still reads cleanly in the live Harvest tab on small devices.
