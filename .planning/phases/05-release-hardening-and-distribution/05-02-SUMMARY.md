# Plan 02 Summary

## Outcome

Release readiness is now enforced through a real repo command instead of scattered assumptions. The codebase has a passing `typecheck`, a new release metadata contract test, aligned checked-in iOS marketing version metadata, and release docs that match the actual internal-distribution and production/TestFlight paths in `eas.json`.

## Changes

- Added `typecheck` and `release:verify` scripts to `package.json` so release verification now runs lint, TypeScript, metadata contracts, and the focused release regression suite in one command.
- Added `src/services/startup/releaseMetadata.test.ts` to keep `package.json`, `app.json`, iOS metadata, Android metadata, EAS version-source settings, and release-doc wording aligned.
- Fixed the existing TypeScript failures by tightening synced-group record typing, centralizing the non-null signed-in user guard for synced group actions, and cleaning up strict-mode test helpers in startup/onboarding/auth-session tests.
- Aligned the checked-in iOS Xcode `MARKETING_VERSION` to `1.0.0` so it matches Expo, Info.plist, Android, and the package version.
- Updated `README.md`, `CLAUDE.md`, and `docs/release-smoke-checklist.md` so preview builds are described as internal distribution, production is the store/TestFlight submission path, and Google sign-in guidance matches the supported client-ID contract.

## Verification

- `npm run typecheck`
- `node --test --import tsx src/services/startup/runtimeConfig.test.ts src/services/startup/releaseMetadata.test.ts`
- `npm run release:verify`
- `npm test`

## Remaining Manual Checks

- Build signed release artifacts and run the smoke checklist on real devices.
- Run `bash scripts/testflight_precheck.sh /absolute/path/to/app.ipa` on the exact iOS submission artifact.
- Confirm the intended tester or internal-distribution path is attached before calling a build available.
