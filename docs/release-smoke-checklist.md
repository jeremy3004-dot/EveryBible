# Release Smoke Checklist

Use this checklist before calling an EveryBible build release-ready.

## Automated Regression Gate

Run:

```bash
npm run release:verify
```

This release gate runs `npm run verify:workspace` (mobile, admin, and site lint/typecheck plus all maintained workspace tests), followed by Expo config validation. Release metadata and signing contracts are part of the workspace test suite.

`npm test` discovers `*.test.ts`, `*.test.tsx`, `*.test.js`, `*.test.mjs`, and `*.test.cjs` under `src`, `apps/admin`, `apps/site`, `packages`, `supabase/functions`, and `scripts`. Generated output and dependency directories are excluded. Operational scripts without the `.test.*` suffix are never executed. Run this command from the repository root; `npm run test:release` remains available as a faster focused regression suite.

The workspace runner enables Node's experimental module mocking so behavioral tests that isolate native dependencies execute instead of skipping. Use Node 22, matching CI.

Pull requests run the reusable **Verify Workspace** workflow. Main pushes and manual Android releases call that same workflow before the Android build job can start. CI uses Node 22 and the repository's npm 11.11.0 version. A failed gate blocks the build; repository branch protection must separately require the verification check to block merges.

## Manual Device Gates

- Fresh install: accept the recommended Bible language from the one-screen onboarding path, then confirm the app lands in the main shell as a guest.
- From More and Profile as a guest, open the auth flow and confirm the shared auth screen appears in the expected mode.
- Verify email/password sign-in on a release-like build, then fully quit and relaunch to confirm session restoration.
- Verify email create-account shows the expected in-flow success behavior when verification is required.
- Verify Apple sign-in on iOS and Google sign-in on a supported build path, and confirm the shared auth screen dismisses correctly after success.
- Read scripture offline, restore reading position, and confirm daily scripture still degrades gracefully when optional content is unavailable.
- Stream audio, pause/seek, and confirm offline download playback still works after reconnects and app backgrounding.
- Open the Harvest tab, confirm local groups remain visible, and verify synced-group session completion only appears when backend and sign-in prerequisites are satisfied.
- Reconnect from offline to online and confirm sync resumes without duplicate progress or broken preference state.
- Select an Every Language audio translation, download a book, fully quit, and relaunch offline. Confirm the selection and download markers remain. Reconnect with one catalog source unavailable and confirm the other source's cached entries remain visible; retry when the source recovers.

## Distribution Gates

- For iOS IPA submissions, run `bash scripts/testflight_precheck.sh /absolute/path/to/app.ipa`.
- Confirm the artifact was built from the intended commit on `origin/main`.
- Verify the exact build can be installed by the intended tester path before describing it as available.

## Deferred Manual Checks

These still require real devices or signed artifacts even when the automated gate passes:

- Reminder delivery
- Push entitlement behavior
- App Store / TestFlight processing state
- Google / Apple provider behavior on physical devices
