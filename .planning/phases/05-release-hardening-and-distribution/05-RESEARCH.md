# Phase 05 Research

## Summary

Phase 5 is a release-evidence and alignment pass, not a large feature build. The repo already has strong logic-test coverage, an iOS IPA precheck script, and EAS production auto-increment enabled, but it still lacks one repeatable release gate, a passing typecheck workflow, and a small contract that keeps Expo/native release metadata from drifting again.

## Key Findings

### Existing Release Guardrails Already Exist In Pieces

- `npm test` and `npm run lint` already cover a broad amount of logic across startup, auth, sync, onboarding, reading, audio, navigation, and groups.
- `scripts/testflight_precheck.sh` already rejects bad iOS artifacts such as wrong bundle IDs, missing embedded JS bundles, Expo dev bundles, and builds that do not match `origin/main`.
- `eas.json` already uses `cli.appVersionSource: "remote"` and production `autoIncrement: true`, which is the right baseline for store submissions.

Relevant files:
- `package.json`
- `scripts/testflight_precheck.sh`
- `eas.json`

### The Release Gate Is Fragmented

- There is no curated release regression command for the product-critical paths the roadmap promises before a release.
- There is also no `typecheck` script, and `npx tsc --noEmit` currently fails on several files, which means the repo can look green through tests while still missing compile-safety.
- The most useful Phase 5 release gate is therefore layered: a focused regression test command first, then a wider release verification command that adds typecheck and metadata checks.

Relevant files:
- `package.json`
- `src/services/groups/groupRepository.ts`
- `src/services/groups/groupService.ts`
- `src/services/onboarding/interfaceLanguageSelection.test.ts`
- `src/services/startup/runtimeConfig.test.ts`
- `src/stores/authSessionState.test.ts`

### Metadata And Release Documentation Have Small But Real Drift

- `app.json`, `ios/EveryBible/Info.plist`, and `android/app/build.gradle` all use version `1.0.0`, but the checked-in Xcode project still has `MARKETING_VERSION = 1.0`.
- `README.md` and `CLAUDE.md` currently describe the `preview` profile as a TestFlight path even though `eas.json` configures `preview` as `distribution: "internal"`.
- The docs also still overstate Google sign-in credential expectations in places even though the repo now documents only the supported client IDs elsewhere.

Relevant files:
- `app.json`
- `ios/EveryBible/Info.plist`
- `ios/EveryBible.xcodeproj/project.pbxproj`
- `android/app/build.gradle`
- `README.md`
- `CLAUDE.md`

### Native Drift Needs Evidence-First Handling

- The checked-in Android manifest contains more permissions than the explicit Expo `android.permissions` array, and Android release signing still references the debug signing block in the generated native project.
- The iOS entitlements file still carries `aps-environment = development`.
- Those checked-in native values may be generated or signing-environment dependent, so they should not be changed casually without build evidence. Phase 5 should focus on the parts that are unambiguously safe to align now: release metadata contracts, documentation, typecheck, and repeatable verification commands.

Relevant files:
- `android/app/src/main/AndroidManifest.xml`
- `android/app/build.gradle`
- `ios/EveryBible/EveryBible.entitlements`

## Recommended Execution Order

1. `05-01`: Add a focused `test:release` regression gate plus a small manual smoke checklist for the critical user journeys named in `REL-01`.
2. `05-02`: Add `typecheck`, fix the current compile errors, codify release metadata alignment in tests, align the checked-in iOS marketing version, and update release docs so preview/internal vs production/TestFlight behavior is described honestly.
