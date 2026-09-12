# Offline Bible reliability acceptance record

Date: 2026-09-12 (Asia/Kathmandu)

Candidate: local working tree at `e8ceccee76bac4aa91dfcf383ad40dc72ea63974`. The checkout already contained unrelated uncommitted public-site and research work; no existing changes were reverted and no commit, merge, distribution, or deployment was performed for this pass.

## Automated evidence

Focused reliability suites were rerun after the final fixes:

```text
cloudTranslationService.behavior.test.ts  38 passed, 0 failed
bibleStore.downloads.test.ts               40 passed, 0 failed
persistedStateSanitizers.test.ts           33 passed, 0 failed
textPackInstallJournalModel.test.ts         1 passed, 0 failed
```

The focused store coverage includes duplicate-operation ownership, text cancellation, audio/text separation, validated representative readback for a New Testament-only pack, deletion settlement, and failed-install preservation. Transport coverage includes checksum/schema/count checks, legacy rollback recovery, bounded checksum cancellation, and closed SQLite handles.

An Astra medium read-only reviewer checked the plan and implementation at the planning, recovery, and final checkpoints. The final code review passed after the representative-readback and readiness-deadlock fixes.

Repository checks:

```text
npm run typecheck       PASS
npm run lint            PASS (existing Babel deoptimization note only)
npm run verify:expo-config PASS
git diff --check        PASS
```

`npm test` ran 4,475 tests: 4,474 passed and 1 failed. The only failure is the pre-existing release metadata assertion in `src/services/startup/releaseMetadata.test.ts` (`actual Android build number 422`, expected `441`); it is unrelated to the offline-install changes and was present before this work.

## iOS simulator evidence

Build command:

```bash
xcodebuild -quiet -workspace ios/EveryBible.xcworkspace -scheme EveryBible \
  -configuration Debug -sdk iphonesimulator \
  -destination 'id=B6292617-B431-4AC5-92BA-2A9FF5D35715' build
```

Result: `BUILD SUCCEEDED` for the iPhone 17 Pro Max Simulator on iOS 26.5. The app was installed and launched with Metro at `http://localhost:8081`. Metro emitted `Home:interaction-ready`, and a current screenshot shows the real Every Bible home screen with scripture, reader actions, Gather, Plans, and the bottom navigation. Local visual evidence: `/tmp/everybible-running-latest.png`.

The native build emits existing dependency warnings (duplicate `-lc++`, unavailable MetalToolchain search path, older pod deployment targets, and script phases without outputs). None prevented the build or launch.

## Device and release gates

The attached physical iPhone is visible to Xcode as offline:

```text
Jeremy Curry’s iPhone (iOS 26.6.2) 00008150-00021C1C2130401C — Devices Offline
```

No Android device was available. Therefore this record does not close physical iOS/Android process-kill, backgrounding, low-storage, upgrade, or offline-relaunch acceptance. It also does not authorize a release or beta distribution. Those gates require the exact candidate on an online, trusted iPhone and a representative low-end Android device, followed by the scenarios in `docs/release-smoke-checklist.md`.

## Remaining action

Run the physical matrix and bounded field pilot after device access is restored. Keep the release-metadata mismatch separate from this reliability change and resolve it through the existing release process.
