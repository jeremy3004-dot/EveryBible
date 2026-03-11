# Release Smoke Checklist

Use this checklist before calling an EveryBible build release-ready.

## Automated Regression Gate

Run:

```bash
npm run test:release
```

This focused gate covers the highest-signal startup, auth, sync, reading, audio, and group logic checks without requiring the entire suite first.

## Manual Device Gates

- Cold-start the app and confirm it lands on the correct gate: onboarding, privacy lock, or main shell.
- Verify email/password sign-in on a release-like build, then fully quit and relaunch to confirm session restoration.
- Verify Apple sign-in on iOS and Google sign-in on a supported build path.
- Read scripture offline, restore reading position, and confirm daily scripture still degrades gracefully when optional content is unavailable.
- Stream audio, pause/seek, and confirm offline download playback still works after reconnects and app backgrounding.
- Open the Harvest tab, confirm local groups remain visible, and verify synced-group session completion only appears when backend and sign-in prerequisites are satisfied.
- Reconnect from offline to online and confirm sync resumes without duplicate progress or broken preference state.

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
