# Plan 01 Summary

## Outcome

The repo now has a focused release regression gate instead of relying on the full suite alone. `npm run test:release` reruns the highest-signal startup, auth, sync, reading, audio, and group tests that map directly to the roadmap's pre-release promises, and a short smoke checklist now captures the device and distribution checks automation still cannot prove.

## Changes

- Added `test:release` to `package.json` as a curated `node --test --import tsx` command covering the critical release-path logic for startup, auth, sync, reading, audio, and group rollout behavior.
- Added `docs/release-smoke-checklist.md` to document the manual release gates for cold start, auth providers, offline reading/audio, sync reconnects, Harvest/group flows, and iOS IPA precheck.
- Kept the release gate intentionally smaller than `npm test` so it stays useful as a fast pre-release confidence pass rather than duplicating the entire suite.

## Verification

- `npm run test:release`
- `npm test`

## Remaining Manual Checks

- Run the smoke checklist on real devices or release-like builds for startup, auth providers, reconnect sync, and offline media behavior.
- Confirm the exact signed build can be installed or distributed through the intended tester path before calling it available.
