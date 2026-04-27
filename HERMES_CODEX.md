# Hermes Codex Handbook for EveryBible

This file is the operational handbook for Codex running inside Hermes CLI against the EveryBible repo.

Use it as the first repo-specific document to load when working here.

## Scope

This handbook covers:

- how to operate safely in this repo
- how EveryBible is structured
- the commands Codex should use for development
- the exact iOS TestFlight flow
- the local-build-only release policy
- the release checks that must pass before calling work done

This handbook does not replace source-of-truth code and config. When there is any doubt, inspect the repo files listed in `Source of Truth`.

## Source of Truth

Read these before changing behavior or shipping a release:

- `AGENTS.md`
- `CLAUDE.md`
- `CODEX.md`
- `README.md`
- `package.json`
- `eas.json`
- `app.json`
- `app.config.js`
- `scripts/testflight_release_guard.ts`
- `scripts/testflight_precheck.sh`
- `scripts/testflight_submit_and_verify.sh`
- `scripts/testflight_verify_distribution.sh`
- `scripts/verify_testflight_distribution.sh`
- `docs/release-smoke-checklist.md`
- `docs/testflight-build-visibility-playbook.md`

If this handbook and those files disagree, trust the source files and update this handbook.

## Operating Rules

Do not hallucinate. If a fact is not in the repo, in the current tool output, or in an explicitly trusted external system, say so and inspect the source.

Start with repository state:

```bash
git status --short
git diff --stat
git log --oneline -5
```

Respect existing changes. This repo is often dirty. Do not revert or overwrite unrelated work.

Use `npm`, not another package manager.

Prefer small, reviewable changes. Fix root causes, not symptoms.

Before claiming success, run the relevant verification commands from `Verification`.

## Repo Identity

EveryBible is an Expo/React Native app with parallel web workspaces in the same repo.

- Mobile app: Expo SDK 54, React Native 0.81, TypeScript, Zustand, React Navigation v7, SQLite, Supabase
- Public site: `apps/site`
- Internal admin: `apps/admin`
- Backend/data services: Supabase plus Cloudflare-hosted assets/workers

Important repo facts:

- Package manager: `npm`
- Workspaces: `apps/*`, `packages/*`
- iOS bundle ID: `com.everybible.app`
- Android package: `com.everybible.app`
- App Store Connect app ID: `6758254335`
- Apple team ID: `NVC9N47PRH`
- EAS project ID: `cfbf2bac-d680-448f-b2aa-33c4c01ad15b`

## Startup Checklist for Codex

When starting work in Hermes for this repo:

1. Read `AGENTS.md`, `CLAUDE.md`, and this file.
2. Inspect `git status`.
3. Inspect the exact files that govern the area you will touch.
4. For release or build work, inspect the TestFlight scripts before acting.
5. For behavior changes, inspect tests first and add regression coverage when practical.

## Project Layout

Top-level structure:

```text
src/           Mobile app source
apps/site/     Public marketing site
apps/admin/    Internal admin app
packages/      Shared utilities/contracts
assets/        App icons, splash, bundled DB, media assets
ios/           Native iOS project
android/       Native Android project
scripts/       Release, build, import, and maintenance scripts
supabase/      DB migrations and backend config
docs/          Project docs and operational playbooks
```

Mobile app hotspots:

- `src/components` reusable UI
- `src/screens` screen-level features
- `src/services` business logic and backend access
- `src/stores` Zustand state
- `src/data` bundled local content such as generated reading plans
- `src/i18n` interface localization

## Non-Negotiable EveryBible Invariants

These are easy to break and must stay explicit:

- TypeScript strict mode is on. Do not paper over errors with `any`.
- Use translation keys for user-facing text.
- Use theme-driven colors. Do not hardcode colors into components unless the repo already does so intentionally.
- Use Zustand for app-wide state, not ad hoc context sprawl.
- Offline-first behavior matters. Local data and persistence are first-class, not fallback behavior.
- Use Expo-compatible native dependencies. Do not introduce a custom native-module strategy casually.
- React Navigation v7 patterns are the expected navigation model.
- The plan/day read-mode reader must use the same floating playback dock behavior as the standard reader. Do not move the play button into the red plan banner unless explicitly asked.
- Reading-plan catalog data is bundled locally in `src/data/readingPlans.generated.ts`; Supabase is not the source of truth for what plans exist.
- If `bible-bsb-v2.db` is rebuilt, update all three in the same commit:
  - DB `PRAGMA user_version`
  - `BUNDLED_BIBLE_SCHEMA_VERSION` in the app code
  - `DEFAULT_MINIMUM_READY_VERSE_COUNT` in the app code
- For Cloudflare R2 syncs, inject AWS credentials explicitly in the command environment so the CLI does not pick up stale shell credentials.

## Environment and Runtime Config

Copy the template if needed:

```bash
cp .env.example .env
```

Core mobile runtime variables from `.env.example`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_BIBLE_ASSET_BASE_URL`
- `EXPO_PUBLIC_ANALYTICS_COLLECTOR_URL`
- `EXPO_PUBLIC_GEO_WORKER_URL`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_BIBLE_IS_API_KEY`
- `EXPO_PUBLIC_CONTENT_API_URL`

Parallel web/admin variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVERYBIBLE_UPSTREAM_API_BASE_URL`
- `EVERYBIBLE_UPSTREAM_API_KEY`
- `OPENAI_API_KEY`

Runtime-config rules:

- `app.config.js` mirrors supported `EXPO_PUBLIC_*` values into `extra.publicRuntimeConfig` during builds.
- Preview and production builds must be created with the correct env vars present.
- Google iOS sign-in depends on `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`; the config plugin derives the iOS URL scheme from it. If that client ID is missing or wrong, release Google sign-in can fail before JS sees an error.

## Development Commands

Core mobile commands:

```bash
npm install
npm start
npm run ios
npm run android
npm run web
```

Notes:

- `npm run ios` launches the Xcode debug app and expects Metro to be running.
- Expo Go is not enough for Apple Sign-In, Google Sign-In, and notifications.

Quality and release verification:

```bash
npm run lint
npm run typecheck
npm run test:release
npm run release:verify
npm run lint:fix
npm run format
npm run format:check
```

Web/admin commands:

```bash
npm run site:build
npm run admin:build
npm run admin:lint
npm run admin:typecheck
```

Supabase commands used in this repo:

```bash
supabase start
supabase db reset
supabase db push
supabase status
```

Useful cleanups:

```bash
npx expo start -c
cd ios && pod install && cd ..
xcrun simctl erase all
```

## EAS Build Profiles

`eas.json` defines three important profiles:

- `development`
  - dev client
  - internal distribution
  - iOS simulator enabled
  - requires Metro when launched
- `preview`
  - internal distribution
  - embedded JS bundle
  - not TestFlight
- `production`
  - store/TestFlight candidate
  - embedded JS bundle
  - `autoIncrement: true`
  - uses EAS remote app-version source

This distinction matters:

- `preview` is for internal installs, not TestFlight.
- TestFlight release candidates come from the `production` profile.

## Standard Development-Build Commands

Development builds:

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

Preview builds:

```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

Production builds:

```bash
npm run testflight:build-local
eas build --profile production --platform android
```

## iOS TestFlight Policy

This repo has a strict iOS release policy:

- build iOS release candidates locally
- keep EAS app-version source remote
- prefer Expo-managed remote iOS credentials
- submit by IPA path
- verify tester/group visibility before calling the release done

Do not shortcut this into "build succeeded" or "upload succeeded".

Release-tool prerequisites:

```bash
eas --version
asc auth status
python3 --version
```

### Hard Rules

1. Use the synced local build flow:

```bash
npm run testflight:build-local
```

This runs:

```bash
npm run testflight:sync-version
eas build --platform ios --profile production --local --non-interactive
```

2. Do not treat missing local signing files as a blocker by default.

The intended default is Expo-managed remote credentials during a local EAS build. Missing local files such as `credentials.json`, `.p12`, or `.mobileprovision` are only relevant if you intentionally switch to local credentials.

3. Keep `eas.json` release settings aligned:

- `cli.appVersionSource` must remain `remote`
- `build.production.autoIncrement` must remain `true`

4. Do not mark a TestFlight release done until the build is attached to the intended beta group and visible to the intended tester path.

### Release Guard

Before an iOS release build, run:

```bash
npm run release:prepare
```

This runs:

- `npm run release:verify`
- `npm run testflight:guard`

The guard checks:

- EAS remote build number is aligned with App Store Connect
- the repo is using remote Expo-managed iOS credentials by default
- if local credentials are explicitly enabled, the provisioning/profile state matches the app bundle
- whether `HEAD` matches `origin/main` for release traceability

Important nuance from the guard logic:

- the EAS remote pre-build number must match the latest uploaded App Store Connect build number
- EAS increments during the production build
- if the remote counter drifts, reset it before building

The guard itself points to:

```bash
eas build:version:set --platform ios --profile production
```

### Local Credentials Override

Do not set `build.production.credentialsSource` to `local` unless you mean to.

If local credentials are intentionally required, the scripts expect an explicit opt-in:

```bash
TESTFLIGHT_ALLOW_LOCAL_CREDENTIALS=true
```

Without that, local credentials mode is treated as policy drift.

## Canonical iOS TestFlight Flow

This is the repo-owned release path.

### 1. Verify repo state and release readiness

```bash
git fetch origin main
npm run release:prepare
```

### 2. Build locally

```bash
npm run testflight:build-local
```

Capture the absolute IPA path from EAS local-build output.

### 3. Precheck the IPA

```bash
bash scripts/testflight_precheck.sh /absolute/path/to/app.ipa
```

The precheck enforces:

- IPA path must be absolute
- bundle ID must be `com.everybible.app`
- `main.jsbundle` must be embedded
- Expo dev bundles must not be present
- IPA `CFBundleVersion` must match the current EAS remote iOS build number

It also reports:

- git SHA
- `origin/main` SHA
- whether `HEAD` matches `origin/main`

Mismatch against `origin/main` is a warning, not an automatic failure, because side-branch TestFlight builds are allowed intentionally.

### 4. Submit and verify in one step

Preferred path:

```bash
TESTFLIGHT_TESTER_EMAIL=curryj@protonmail.com \
TESTFLIGHT_GROUP_NAME='Internal Testers' \
IPA_PATH=/absolute/path/to/app.ipa \
npm run testflight:submit-and-verify
```

What this does:

- runs the IPA precheck
- submits with `eas submit --platform ios --profile production --path ... --non-interactive --no-wait`
- polls App Store Connect until the build is `VALID`
- verifies distribution to the requested tester/group
- attaches the build to the target group/tester if missing and allowed by script flags

### 5. If the IPA was already uploaded, verify distribution directly

```bash
TESTFLIGHT_TESTER_EMAIL=curryj@protonmail.com \
TESTFLIGHT_GROUP_NAME='Internal Testers' \
BUILD_VERSION=250 \
npm run testflight:verify-distribution
```

This wraps the lower-level verifier and can repair missing tester/group linkage.

## TestFlight Visibility and Repair

If a build uploaded but testers cannot see it, use the playbook in `docs/testflight-build-visibility-playbook.md`.

Core diagnostics:

```bash
asc builds list --app 6758254335 --sort -uploadedDate --limit 10 --output json
asc testflight beta-details get --build BUILD_ID --output json
asc testflight beta-groups list --app 6758254335 --output json
asc testflight beta-groups relationships get --group-id GROUP_ID --type builds --paginate --output json
asc testflight beta-testers list --app 6758254335 --output json
asc testflight beta-testers builds list --tester-id TESTER_ID --output json
```

Common repair actions:

```bash
asc builds add-groups --build BUILD_ID --group GROUP_ID
asc testflight beta-testers add-builds --id TESTER_ID --build BUILD_ID
asc testflight review submit --build BUILD_ID --confirm --output json
```

Interpretation rules:

- `processingState=VALID` means the build exists and finished ASC processing
- internal testers may still not see the build if group/tester linkage is missing
- external testers require external beta review state, not just upload success

### Internal vs External Testing

Default release target:

- land on `main`
- release to `Internal Testers`

Only go beyond that if explicitly requested.

For external gating, the repo exposes:

```bash
npm run testflight:external
```

That script targets the `External Testers` group for the given `BUILD_VERSION`.

## Android Release Flow

Build:

```bash
eas build --platform android --profile production
```

Submit:

```bash
eas submit --platform android --profile production
```

`eas.json` currently targets Play production as a draft release.

## Web and Admin Workstream

This repo is not mobile-only anymore.

Use these when touching the parallel web workstream:

```bash
npm run site:build
npm run admin:build
npm run admin:lint
npm run admin:typecheck
```

Required environment values are in `.env.example`.

If admin env vars are missing, the app is expected to show a setup screen rather than crash.

## Content, Assets, and Data Notes

Bible/media asset publishing:

- Cloudflare R2 bucket: `everybibleapp`
- endpoint: `https://9ebfac5a12f408afc1d80eaa2138ffd3.r2.cloudflarestorage.com`

For R2 sync commands, inject AWS credentials explicitly into the command environment. Do not rely on ambient shell credentials.

Do not store raw access keys in docs, code comments, or memory files.

Relevant asset/data scripts in `package.json`:

```bash
npm run build:bible-db
npm run verify:bible-db
npm run generate-timestamps
npm run codegen-timestamps
npm run extract-verse-text
npm run catalog:translation
npm run import:open-bible-audio
npm run manifest:text-packs
```

## Verification

Use the full relevant gate before handoff.

For normal app work:

```bash
npm run lint
npm run typecheck
```

For release-sensitive work:

```bash
npm run release:verify
```

For iOS release candidates:

```bash
npm run release:prepare
bash scripts/testflight_precheck.sh /absolute/path/to/app.ipa
```

Manual checks still matter for:

- onboarding
- auth flows on release-like builds
- offline reading behavior
- audio playback and background behavior
- sync recovery
- group flows
- TestFlight visibility

See `docs/release-smoke-checklist.md`.

## Definition of Done

Do not say a change is done until all of the following that apply are true:

- code changes are complete
- relevant tests/checks passed
- release-sensitive changes passed `npm run release:verify`
- for iOS releases, `npm run release:prepare` passed
- for iOS releases, the IPA passed `scripts/testflight_precheck.sh`
- for TestFlight releases, the build is `VALID` and visible to the intended tester/group path
- if you touched docs or release workflow behavior, update docs

## Quick Reference

Most common commands:

```bash
# Repo state
git status --short

# Dev
npm start
npm run ios
npm run android

# Quality
npm run lint
npm run typecheck
npm run release:verify

# iOS release
npm run release:prepare
npm run testflight:build-local
bash scripts/testflight_precheck.sh /absolute/path/to/app.ipa

TESTFLIGHT_TESTER_EMAIL=curryj@protonmail.com \
TESTFLIGHT_GROUP_NAME='Internal Testers' \
IPA_PATH=/absolute/path/to/app.ipa \
npm run testflight:submit-and-verify

# TestFlight repair
TESTFLIGHT_TESTER_EMAIL=curryj@protonmail.com \
TESTFLIGHT_GROUP_NAME='Internal Testers' \
BUILD_VERSION=250 \
npm run testflight:verify-distribution
```

## Final Rule

When operating in Hermes, prefer the repo’s existing scripts over ad hoc command sequences.

For EveryBible, the safest default is:

- inspect the source-of-truth files
- use the scripted release path
- keep iOS release builds local
- use ASC for verification and repair
- never equate upload success with TestFlight availability
