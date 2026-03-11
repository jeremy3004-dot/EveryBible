# Plan 01 Summary

## Outcome

The discipleship surface is now reachable from the live app shell. The repo already had a complete learn stack, but it was effectively orphaned because the root tab navigator never mounted it. Phase 04-01 fixes that by exposing the existing Learn stack as a live Harvest tab and adding a small regression-tested tab manifest so that mount point stays explicit.

## Changes

- Added `src/navigation/tabManifest.ts` plus `src/navigation/tabManifest.test.ts` to define the root tab order, translation keys, and icon pairing in one tested place.
- Updated `src/navigation/types.ts` so the root tab contract includes `Learn`.
- Updated `src/navigation/TabNavigator.tsx` to mount `LearnStack` in the live tab shell and to resolve tab icons from the shared manifest.

## Verification

- `node --test --import tsx src/navigation/tabManifest.test.ts`
- `npx eslint src/navigation/types.ts src/navigation/TabNavigator.tsx src/navigation/tabManifest.ts src/navigation/tabManifest.test.ts`
- `npm test`

## Remaining Manual Checks

- Launch a release-like build and confirm the Harvest tab appears in the live bottom navigation.
- Open the Harvest tab, enter the Four Fields journey, open a lesson, and confirm back navigation still returns cleanly to the learn surface.
