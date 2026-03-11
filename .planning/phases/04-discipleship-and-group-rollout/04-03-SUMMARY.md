# Plan 03 Summary

## Outcome

Synced group sessions now have an explicit, guarded backend path instead of relying on implicit UI assumptions. Local groups still complete sessions entirely on-device, while synced groups either save through the real Supabase service path or stop with a stable, user-visible error when backend configuration or sign-in is missing.

## Changes

- Added `src/services/groups/groupServiceGuards.ts` plus `src/services/groups/groupService.test.ts` as the pure guard layer for backend-configured, sign-in-required, and ready states used by synced group actions.
- Updated `src/services/groups/groupService.ts` so `updateSyncedGroupLesson` and `recordSyncedGroupSession` fail with stable configuration/auth errors before trying to hit the backend.
- Updated `src/screens/learn/GroupSessionScreen.tsx` to resolve both local and synced groups through the repository boundary, keep local completions on-device, and save synced sessions through `recordSyncedGroupSession` plus `updateSyncedGroupLesson` when the synced path is available.
- Updated `src/screens/learn/GroupDetailScreen.tsx` so synced groups can launch the guarded session flow once service readiness is satisfied, while still keeping the broader synced member/history surface honest.

## Verification

- `node --test --import tsx src/services/groups/groupService.test.ts src/services/groups/groupRepository.test.ts src/screens/learn/groupRolloutModel.test.ts`
- `npx eslint src/services/groups/groupService.ts src/services/groups/groupServiceGuards.ts src/services/groups/groupService.test.ts src/services/groups/groupRepository.ts src/services/groups/groupRepository.test.ts src/services/groups/index.ts src/screens/learn/GroupDetailScreen.tsx src/screens/learn/GroupSessionScreen.tsx src/screens/learn/GroupListScreen.tsx src/screens/learn/groupRolloutModel.ts src/screens/learn/groupRolloutModel.test.ts`
- `npm test`

## Remaining Manual Checks

- On a backend-configured signed-in build, open a synced group, complete a session, and confirm the lesson advances and the backend session record is created.
- On a build without backend configuration, confirm synced group session entry stays unavailable and the user-facing messaging remains clear.
- Verify local groups still complete sessions entirely offline without regressing lesson progression.
