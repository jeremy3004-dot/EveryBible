# App optimization review — 2026-09-05

This second pass reviewed mobile catalog loading, reader/Home lifecycle, audio downloads, and cloud synchronization. Changes preserve the existing UI and the earlier security fixes.

## Fixed findings

| Area | Change | Regression evidence |
| --- | --- | --- |
| Catalog refresh | Index existing translations by ID instead of scanning them for every remote entry | 1,000 entries: 500,500 → 1,000 ID reads; download state retained |
| Translation preferences | A failed read now stops the write instead of replacing unknown saved preferences with defaults | Actual service tests cover failed reads, first selection, omitted fields, and explicit null |
| Home verse loading | Ignore superseded responses/errors and settle the active request's loading state | Deferred override/SQLite responses complete out of order without replacing newer content |
| Translation picker counts | Count each normalized language once | 1,200 entries across 600 languages: 720,000 → 1,200 language reads |
| Translation picker retry | Always consult the existing per-launch hydration gate on mount | Cached rows no longer prevent retry after a partial catalog failure |
| Browser feedback loading | Use one focus effect for initial loading, translation changes, and returning from the reader | Focused mount fetches once; hidden screens do not fetch; blur/unmount invalidate pending results |
| Audio job registry | Share one serialized registry per filesystem/root, read once, commit memory after successful writes | Concurrent jobs survive together; removals stay removed; failed writes do not poison later work |
| Offline audio lookup | Reject undersized cached files and try the valid legacy/streaming path | Invalid playback candidates are ignored without deleting active partial transfers; metadata lookup avoids duplicate native calls |
| Cloud sync races | Merge current local state after reads, guard stale acknowledgments, serialize/coalesce writes by account and generation | Settings/chapters edited during requests survive; newest queued state is uploaded last; switched accounts remain isolated |
| Reconnect sync | React to actual offline-to-online transitions | Ten repeated online notifications: 10 → 0 redundant cycles; real reconnect: one cycle |

These are deterministic work-count measurements, not device latency or frame-rate claims. The audio registry fixture (one insert, 50 lookups, one removal) drops from 52 disk reads to one with the same two writes. Eleven overlapping settings requests coalesce into two ordered writes.

## Verification

All new bug/performance regressions were observed failing before their fixes. Independent agent review covered catalog/preferences and sync; primary review covered all production diffs.

- `npm run release:verify` on Node 22: **1,578 passed, zero failures, zero skips**; mobile/admin/site lint and typechecks, release contracts, and Expo config validation passed.
- Android production export: passed, including Hermes bytecode and asset generation.
- iOS Release simulator build: passed, including a final rebuild after formatting, with an embedded bundle and local signing.
- `git diff --check`: passed. The original user-owned `Info.plist` is unchanged (SHA-256 `69bf114a7bf8b742d7a76432d1c8c23df5adf1c2b32c7e2fbb61785720ac79e9`).
- iOS 26.5 / iPhone 17 Pro Max simulator smoke: fresh guest onboarding, Home Scripture, Bible browser, Genesis 1 → Genesis 2, translation picker, and BSB → ASV selection passed. Reinstalling the final Release build and relaunching retained ASV and Genesis 2; Home displayed the ASV verse and “Continue Genesis 2” reopened that chapter in ASV.
- The smoke check used a separate temporary simulator; the existing simulator and its data were preserved. The temporary app session was closed and its simulator removed afterward.
- After formatting the final three source files, all 48 affected regression tests passed again.

Local verification logs: `/tmp/eb-pass2-release-verify.log`, `/tmp/eb-pass2-android-export.log`, `/tmp/eb-pass2-ios-final-build.log`, and `/tmp/eb-pass2-postformat.log`.

## Scope and follow-up

- No dependency upgrades, visual redesign, publishing, commits, or remote data/configuration changes in this pass.
- Existing changes and user-owned files were preserved.
- Android runtime smoke was unavailable because no Android device or emulator system image was installed. Physical low-end Android timings and real-device background audio/network behavior still require device profiling. The deterministic tests establish correctness and reduced work; they do not quantify perceived speed on hardware.
