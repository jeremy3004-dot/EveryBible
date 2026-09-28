# Optimization continuation — September 28, 2026

## Current handoff

**13 follow-up fixes (101–113) are reviewed and verified locally.** Final gate34 passed **9,917 tests**, lint, mobile/admin/site/strict type checks and Expo configuration. Existing deferred type diagnostics and the admin font warning remain documented below.

The final Android34 APK is installed and hash-verified. Its source map matches 134 changed runtime modules. Native playback, text-only/audio-enabled controls, language selection and the corrected Gather highlight have evidence. The final screenshot shows only verse4 highlighted, with verses1–3 clear; the earlier build retained the old highlight. Home is restored, narration paused, existing20 completed chapters, Jude1 Continue, Proverbs28 plan and0/9 Gather completion preserved. Captured app logs have no critical matches.

Measured render improvements: language rows30→0 per10 download ticks; Home450→0 for current or borrowed-source download ticks; Gather question panels58→0 host renders per same-verse tick, with story text also avoiding unchanged-verse redraws. These are controlled render counts, not device latency claims.

All follow-ups remain in the isolated checkout. No staging, commits, pushes, integration or publishing. All297 frozen original-checkout paths still match their baseline. Shared node_modules remained read-only; native changes were applied only to the isolated scratch dependency.

Artifacts: `qa-evidence/optimization-continuation/continuation.patch` and `continuation-manifest.json` contain only this continuation relative to the frozen100-fix baseline. The patch is applied to a temporary baseline copy and every resulting candidate file hash is checked. Native proof: `standalone34-artifact.json`, `native113-before-after.json`, `final-state.json`. [Device checklist](2026-09-28-optimization-device-checklist.md).

Limits: new follow-ups have not been published to TestFlight; physical iPhone, live prayer/backend flows and true OS suspension remain separate gates. The earlier primary ignored-Android-folder setup incident remains documented in the prior audit and `/tmp/everybible-isolated-android-qa/root-native-prebuild-incident.md`; exact original ignored-cache restoration was not established. This continuation did not modify that primary native folder.

Weekly usage reached100%; optimization stopped at the requested limit. No reset credits were used. All workers are complete/HOLD; no builds remain running.

## Historical checkpoints

The entries below retain intermediate states and evidence; the current handoff above supersedes their pending statuses.

## Scope and ownership

- User resumed optimization with Astra/high primary and Astra/low implementation workers only. No Sol/Luna or nested delegation in this continuation.
- Isolated managed checkout: everybible-next-optimizations/EveryBible. Base HEAD86d0b043cc645ae667246ff1ebd8d7569620b8fc plus297 SHA-verified paths from the frozen100-fix audit. Baseline manifest: qa-evidence/optimization-continuation/baseline.json.
- Original checkout, TestFlight candidate, physical phone and notes recovery remain owned by the separate release/recovery chat. No integration, commits, staging, publishing or live changes from this continuation.
- node_modules is a read-only dependency symlink; no package changes. Native builds must remain isolated and cannot interfere with recovery work or disk headroom.
- Latest weekly usage89%used/11%remaining at the start of Android build30. User requests continuing until weekly allowance is consumed; no reset credits, paid-overage or manufactured work.

## Accepted change101

Timed sleep now expires on an active buffering callback even when the reader is closed. Late playing/buffering callbacks after a listener Pause cannot change paused status back to loading or restart the frozen timer. Terminal chapter-finish snapshots still reach the finish handler.

- Production change: src/hooks/audioPlayer/playbackProgress.ts.
- Three regression scenarios in src/hooks/useAudioPlayer.test.ts: wall-clock advance without firing JS timers, repeated expired buffering callbacks, pre-deadline buffering and manual pause/resume.
- RED: /tmp/everybible-sleep-recovery-red.log and /tmp/everybible-sleep-recovery-controls-red.log.
- Worker505 player/store/model checks; root reviewed production diff and full integrated gate29 passed9883 tests, zero fail/skip/cancel. Lint, mobile/admin/site/strict types and Expo config passed. Existing47 deferred diagnostics and admin font warning remain. Gate log /tmp/everybible-optimization-gate29.log.
- Proof limit: deterministic real-player-hook callback recovery; no claim of physical OS suspension timing or installed-build verification for101 yet.

## Additional bounded audits

- Search lifecycle:8 new controls cover stale errors/successes after query/translation changes, clear, reference navigation and unmount;53 browser checks pass. No production defect.
- Download durability:4 new controls cover absent/truncated receipts and failed/truncated completion metadata;171 checks pass. Native filesystem implementation supports the simulated failures. No production defect or physical disk-exhaustion claim.
- Cache identity:143 existing provider/manifest/path tests pass; no demonstrated admissible cross-translation path collision.
- Startup ordering: real coordinator, Home loader and Bible service with held catalog and mocked native DB show Home/reader independently initialize/read bundled data before catalog completes, with one DB initialization. No justified concurrency change or device-latency claim.

## Follow-up changes under integrated verification

-102: prayer submission preserves a newer draft and its focus; edit-generation handles A→B→A. Unchanged submitted draft still clears.
-103: unavailable audio no longer exposes Play. Current playing/loading chapter retains Pause/cancel even if refreshed metadata loses audio availability; paused unavailable content cannot restart. Eight render regressions/controls,75 focused checks pass.
-104: Android metadata invalidates previous artwork work on every update/reset and destruction. Cancellation propagates; generation/lifetime/current-coroutine checks prevent stale publication. Metadata/reset bridge calls run on Main. Existing native fixes preserved. Exact updateMetadata/loadArtwork/onDestroy methods tested with real Kotlin coroutines and IO dispatch: baseline five failures, patched seven passes. Android builders/bitmap IO are controlled test seams. Root independently reran seven and reverse/apply verified byte-identical staged package. Patch SHA b4b47723f41c902fef66c6467d0126f2de07d31761a97547ee6aa6be2a92c3eb. Actual Android compilation still pending.
-105: older prayer report completion cannot close a reopened form or show stale alerts; its confirmed server result still updates the appropriate row.
-106: first-page and pagination snapshots started before confirmed prayer writes cannot revert those writes. Current loading indicators still settle; failed writes leave valid refresh results eligible. Prayer suite166 checks and types/lint pass.

All six fixes101–106 passed full gate30:9903 tests, no failures/skips/cancellations; lint, mobile/admin/site/strict types and Expo configuration passed. Log /tmp/everybible-optimization-gate30.log. The patch was applied only to the isolated scratch dependency and its native Kotlin compilation passed. Frozen source map matches132 changed runtime sources, with five expected type-only absences. APK completion, install and UI checks remain pending.

Additional read-only reviews found two bounded follow-ups: confirmed prayer creation can duplicate a row already received by refresh, and language-list rows render unnecessarily on unrelated audio download ticks (30 extra row renders across10 ticks in a three-language fixture, no index rebuilds). Temporary deterministic repros recorded; no production edits during build30 freeze. Native104 adversarial review passed ten real-coroutine scenarios and verified local Expo Main-queue dispatch semantics; Android system lifecycle behavior remains outside that harness.


## Gate31 and installed Android verification

-107: confirmed prayer creation deduplicates an ID already received by refresh and preserves the refreshed content, counts and answered state. New unseen requests still prepend; draft102 behavior remains covered.167 focused tests pass.
-108: memoized language list avoids30 unchanged row renders across10 audio ticks in the three-language actual-render fixture; selection, new catalog language and search stay reactive.65 focused checks pass. No device-latency claim.
- Root reviewed both production diffs and full gate31 passed9905 tests, no failures/skips/cancellations. Lint, mobile/admin/site/strict types and Expo config pass. Log /tmp/everybible-optimization-gate31.log.
- Android30 compiled patched native source, with lifetime fields verified in release JVM class and finalDEX. A scratch2GiB heap failed duringR8;4GiB retry passed in73seconds while preserving8.25GiB disk guard. Artifact and installedAPK hash matched cc116239a7208aa07668a3852d2d511cb694f4011ec3432274d9a14adb876470. On actualUI, ASV text loaded with unavailablePlay absent and previous/next retained; BSB Play starts Jude1 and Pause pauses it. NativeMediaSession and screenshots prove playback; stale UIAutomator XML from a nonidleplaying screen was discarded.
- Android31 includes101–108, built in27seconds, matches133 changed runtime sources, same83 native libraries and manifest as baseline26. InstalledAPK SHA9ec1f7d36259ba4df0dd90f4a56dba4cb42b9db0158dff4a22c1086263d94c20; embedded bundle b614e9e9e5b867d9b5ccfcba2716d5d5c40c585ec904d74294dce79df6a9893f. Local QA signing only.
- Latest weekly usage91%used. Additional bounded search36 combinations, SQLite lifecycle166 checks, audio render108 checks and foregroundownership30 checks found no new defect. Proof remains local; physicalphone, notes recovery and release belong to separatechat.

## Final rendering follow-ups

-109 root-reviewed: Home selects the current translation with shallow equality while excluding activeDownloadJob. Ten actual store ticks no longer cause450 host /20 verse-text renders. All other catalog/install fields remain reactive;80 focused checks, lint and types pass.
-110 under integration: Gather story subtree is memoized; callbacks and followed verse semantic identity remain stable within a verse. Regression captured111 host /44 text renders on one unchanged-verse progress tick before the fix. Verse changes, stop, font/theme/translation/retry remain required controls.
- Latest weekly usage94%used. Primary297 frozen paths rehashed unchanged. Native31 language preference changes to Nepali and back to English are reflected correctly; BSB retained, critical app log matches zero, Home restored.

Root and independent reviews accepted109/110. Gate32 passed9911 tests, no failures/skips/cancellations; lint/all types/Expo config pass. Android32 compiled successfully in2m17s and frozen map matches134 runtime sources. Follow-up111 narrows borrowed-Scripture fallback subscription to abbreviation and language only: ten fallback download ticks450→0 host renders, source label/font/share fallback controls pass84 checks.112 narrow question-panel isolation in progress; no broader audits remain.

Root reviewed111 selector and112 question-panel changes.112 memoizes only unchanged translated question arrays and panels; Replay/Share callbacks retain source/locale dependencies. Actual panel counts58host/24Text→0/0 for one same-verse tick; full screen102host/37Text→44host/13Text. Theme, translated questions/share text and replacement-audio Replay controls pass focused tests. Final integrated gate33 and installed native33 verification pending. Latest usage97%used.

## Final integrated candidate101–112

All twelve follow-up fixes are frozen. Root reviews and independent111/112 review97 render controls pass. Full gate33 passed9917 tests, zero failed/skipped/cancelled, lint/all types/Expo configuration passed. Existing47 deferred diagnostics and one admin font warning remain unchanged. Gate log /tmp/everybible-optimization-gate33.log.

Android33 built in27seconds, verified against134 runtime source modules. InstalledAPK SHAe8e00d1d4efb5c73f93aafb384bb0253b8a6257ac2e6203bd7cdebe7878bc04b, embedded bundle18f9876f4fe640dadd5afa7d94c317836751c346db2dff5aa00d4004fa12cccb. Signer, manifest,83native libraries and29arm64 alignment remain verified; finalDEX contains104 generation/lifetime fields. Cold launch retainsHome dailyverse,20chapters,1daystreak,Proverbs28plan andJude1Continue. NativeGather check in progress. Weekly usage98%used at this checkpoint.

Device checklist: [optimization device checks](2026-09-28-optimization-device-checklist.md). This candidate has not been integrated into the original checkout or published; physicalphone/recovery remains separately owned.

## Native finding113 at99%weeklyusage

Native33 Gather playback advanced0:02→0:16 andPause worked at0:17, but verse1 background remained after verse2 became followed. InstalledReactNative legacy Android virtual-text setBackgroundColor only updates stored background for non-null colors; removing the conditional style does not clear it. Source behavior existed before110/112. Fix113 under verification explicitly sets transparent for unhighlighted nested story text. Native31 comparison and final34 gates pending; do not treat33 as clean of this highlight defect.

Native31 comparison confirms113 is pre-existing: installed31 hash9ec1f7d36259ba4df0dd90f4a56dba4cb42b9db0158dff4a22c1086263d94c20,0:18 screenshot retainsverse1bluewhileverse2followed. Sameconditionalstylepredates110/112. Rootreviewedexplicittransparentfix;65focused/typelintpass plus exactinstalledJava setter harness retainsff112233onnullandclears0ontransparent. Gate34/build34 running; allworkersHOLD.

Gate34 passed9917 tests, zero failed/skipped/cancelled; lint/all types/Expo configuration pass. Android34 built in29seconds with134 runtime source matches. InstalledAPK SHA c1b11edde13ba43171e0343d02600b74e24aa40f631d4cc3ece960d9639bfc27; embedded bundle c0f1085022815f980b44b1bf7574cf6c0f8b9b6972b1d4145b6d06b39f690e58. Native113 final visual check in progress.

**Native113 PASS:** installed34 screenshot at0:23 highlightsverse4only; priorverses1–3areclear. This contrasts with installed31 at0:18 showingstaleverse1backgroundwhileverse2iscurrent. Rootvisuallyinspectedboth. Evidence native113-before-after.json and adjacent screenshots. Playbackpausedaftercapture; finalrestorationinprogress.
