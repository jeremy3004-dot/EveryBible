---
status: resolved
trigger: "Investigate and fix issue: android-calculator-hidden-view"
created: 2026-04-21T00:00:00+05:45
updated: 2026-04-21T14:33:51+05:45
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: confirmed and fixed. Enabling discreet mode saved the setting but left the app unlocked until a later background event, and the Android launcher-disguise setup was only present in ignored generated native files instead of the tracked prebuild plugin.
test: focused privacy/config tests, targeted lint, Expo config load, and TypeScript compile all pass.
expecting: Android prebuilds now receive the calculator launcher alias/native module, and enabling discreet mode immediately activates the calculator lock screen after leaving preferences.
next_action: manual Android device/emulator smoke when adb/emulator is available.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: When the user enables the calculator's hidden view on Android, the hidden/calculator view should activate and function as intended.
actual: On Android, turning on the calculator hidden view does not work.
errors: No stack trace or console output provided yet.
reproduction: On Android, open the calculator feature/settings, turn on the hidden view, observe that it does not work.
started: Unknown; treat as current regression until git history/code evidence says otherwise.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-21T14:27:06+05:45
  checked: active debug sessions and git status
  found: existing active debug sessions are present; user supplied a new issue, so a new session was created. Worktree is already dirty with many modified and untracked files unrelated to this issue.
  implication: edits must be scoped carefully and no unrelated changes should be reverted.
- timestamp: 2026-04-21T14:27:37+05:45
  checked: workspace startup and project instructions
  found: EveryBible is an Expo/React Native app; TypeScript strict mode, themed colors, translation keys, Zustand state, and Android/iOS platform verification are expected. No today/yesterday memory files were present.
  implication: fix should follow existing RN/Expo patterns and include Android-relevant regression coverage where feasible.
- timestamp: 2026-04-21T14:28:32+05:45
  checked: docs-list and code search for calculator/hidden/privacy/Android terms
  found: docs-list has no privacy/calculator feature doc. Code search points to privacy mode: src/screens/more/PrivacyPreferencesScreen.tsx, src/stores/privacyStore.ts, src/services/privacy/*, and src/components/privacy/PrivacyLockScreen.tsx.
  implication: investigation should focus on the privacy mode save/activation pipeline and lock screen behavior.
- timestamp: 2026-04-21T14:33:01+05:45
  checked: Android native launcher implementation
  found: AndroidManifest.xml defines DefaultLauncherAlias and DiscreetLauncherAlias, EveryBiblePrivacyModule enables the target alias before disabling the old alias, MainApplication registers EveryBiblePrivacyPackage, and discreet launcher assets/strings are present.
  implication: the Android native calculator icon path is wired; the failure is more likely in JS activation state than a missing native module or manifest entry.
- timestamp: 2026-04-21T14:33:01+05:45
  checked: JS privacy activation flow
  found: privacyStore.saveConfiguration({ mode: 'discreet' }) saves the discreet mode and schedules the app-icon change, but explicitly sets isLocked to false. App.tsx only renders PrivacyLockScreen when isLocked is true, and usePrivacyLock only locks after a later AppState background/inactive transition.
  implication: enabling Android calculator hidden view changes/stores mode but does not show the calculator lock view until a later lock event, so "turning on" the hidden view appears not to work.
- timestamp: 2026-04-21T14:33:51+05:45
  checked: fix implementation
  found: PrivacyPreferencesScreen now schedules the existing privacy lock action with InteractionManager after a successful discreet-mode save and navigation back; a source regression test asserts this activation path.
  implication: enabling the Android calculator hidden view now immediately transitions into the calculator lock screen instead of waiting for a later background event.
- timestamp: 2026-04-21T14:45:00+05:45
  checked: tracked Android prebuild path
  found: the generated `/android` project is ignored by git, so local Android native edits alone would not survive a clean checkout or prebuild. The tracked Expo config plugin now writes the Android privacy native module/package, registers it, creates launcher aliases, gives the discreet alias the Calculator label, and copies discreet launcher icons during Android prebuild.
  implication: the Android calculator disguise is now durable instead of depending on ignored generated native files.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: Enabling discreet/calculator mode persisted the setting but left `privacyStore.isLocked` false. The calculator UI is gated solely by `isLocked`, so users stayed in the normal app immediately after enabling hidden view. Separately, the Android launcher-disguise native setup existed only in ignored generated native files, so clean Android prebuilds could miss the calculator alias/module entirely.
fix: Updated PrivacyPreferencesScreen to call the existing privacy store lock action after successful discreet-mode saves, deferred through InteractionManager after navigation. Added tracked Android prebuild support in plugins/withBrandedSplashAsset.js so Android gets the privacy native module, package registration, launcher aliases, Calculator label, and discreet icon assets. Added source regression tests for both paths.
verification: Focused Node tests passed; targeted ESLint passed; `npm run verify:expo-config` passed; `npm run typecheck` passed. Full `npm test` was attempted and failed on unrelated pre-existing suites outside this change area.
files_changed: [plugins/withBrandedSplashAsset.js, src/config/androidPrivacyLauncherSource.test.ts, src/screens/more/PrivacyPreferencesScreen.tsx, src/screens/more/privacyPreferencesScreenSource.test.ts]
