# Phase 05 Validation

## Goal

Validate release readiness with evidence that can be rerun locally instead of relying on memory, scattered commands, or stale assumptions about Expo/native configuration.

## Risk Areas

### 1. Critical Flow Coverage Is Still Implicit

- Risk: important startup, auth, sync, reading, audio, and group paths are technically tested somewhere in the repo, but nobody can rerun the right subset quickly before release.
- Validation: Phase 05-01 should create one explicit regression command that exercises the user journeys most likely to break the release.

### 2. Compiler Safety Is Invisible To The Current Release Process

- Risk: the repo can look healthy through test runs while `tsc` still fails, leaving release candidates with broken static contracts.
- Validation: Phase 05-02 must add a real `typecheck` script, fix the current failures, and include it in the final release verification path.

### 3. Release Metadata Can Drift Across Layers

- Risk: Expo config, native iOS config, native Android config, and EAS release settings gradually diverge even when the app still builds.
- Validation: add a focused metadata contract test that asserts the current version/build identifiers and release-source settings stay aligned.

### 4. Release Docs Can Overclaim The Real Distribution Path

- Risk: engineers or future agents follow repo docs that say preview means TestFlight when the actual EAS config says internal distribution.
- Validation: README/guide updates should match the current `eas.json` behavior and explain which path is internal distribution versus store/TestFlight submission.

### 5. Native Generated Files Invite Unsafe Cargo-Cult Fixes

- Risk: generated native files such as entitlements, manifest permissions, or signing blocks get “fixed” without proof that the generated release artifacts are actually wrong.
- Validation: Phase 5 should only change native config where the mismatch is explicit and verifiable now, and push the rest into documented manual release checks.

## Evidence Expectations

- `npm run test:release` exists and covers the core Phase 1-4 user journeys that matter before release.
- `npm run typecheck` passes fresh.
- A release verification command combines lint, typecheck, and release regression checks.
- A focused metadata contract test protects version/build alignment and EAS release-source expectations.
- Release docs describe internal builds, TestFlight/store submission, and supported Google sign-in config without contradiction.
