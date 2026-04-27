---
status: awaiting-human-verify
trigger: "Investigate issue: bsb-ephesians-downloaded-wont-play\n\nSummary: In the EveryBible app, Ephesians in the Berean Standard Bible (BSB) appears as downloaded, but tapping play does not start playback. Deep-dive the likely root cause and fix it if confidently validated."
created: 2026-04-15T15:32:45Z
updated: 2026-04-15T16:08:00Z
---

## Current Focus

hypothesis: BSB Ephesians is marked as downloaded in persisted store state, but the actual local chapter file is missing or invalid, causing the player to prefer a broken offline path over a working remote path.
test: Inspect the real BSB asset URLs and the simulator/device audio download directory for EPH, then compare that against persisted `downloadedAudioBooks` state and the playback resolver.
expecting: If the download marker is stale, EPH will be present in `downloadedAudioBooks` while `getDownloadedChapterAudioUri()` returns null or a bad file for one or more chapters.
next_action: Inspect actual BSB remote asset availability and any installed simulator app container/audio download files.

## Symptoms

expected: If BSB Ephesians is marked downloaded, chapter audio should play, especially offline.
actual: User cannot listen to Ephesians in BSB even though the app says it is downloaded.
errors: No explicit error message reported yet.
reproduction: Open BSB, navigate to Ephesians, observe downloaded state, attempt playback; audio does not start.
started: Reported on 2026-04-15. Recent repo history includes a commit named "fix(audio): block unsupported translation playback".

## Eliminated

- The Apr 13 remote-availability guard is not blocking BSB Ephesians by design. BSB is configured as `coverage: full-bible`, and the book-specific `isRemoteAudioAvailable('bsb', 'EPH')` path should return `true`.
- Live remote BSB assets for Ephesians are not missing. On 2026-04-15, `https://everybible.app/api/media/audio/bsb/EPH/1.m4a` and `.../EPH/6.m4a` both returned `HTTP/2 200`.

## Evidence

- timestamp: 2026-04-15T15:35:00Z
  checked: .planning/debug/knowledge-base.md
  found: No prior knowledge-base entry matched this symptom strongly; only generic playback entries existed for unrelated mini-player visibility and dock bounce issues.
  implication: This likely is a different failure mode, so direct code/path tracing is needed.

- timestamp: 2026-04-15T15:35:45Z
  checked: src/constants/translations.ts and src/services/audio/audioRemote.ts
  found: BSB is configured with `hasAudio: true` and a full-Bible `stream-template` catalog at `${AUDIO_BUCKET_BASE}/bsb` using `{bookId}/{chapter}.m4a`; `isRemoteAudioAvailable('bsb', bookId)` should stay true for any Bible book.
  implication: The Apr 13 book-specific remote-audio guard should not block BSB Ephesians by design.

- timestamp: 2026-04-15T15:36:20Z
  checked: src/services/audio/audioService.ts and src/services/audio/audioDownloadService.ts
  found: Playback resolves local audio first via `getDownloadedChapterAudioUri()`, then falls back to remote audio; local lookup accepts both the current extension and a legacy `.mp3` fallback.
  implication: A stale downloaded-book marker or a bad local file can break BSB playback even though remote BSB support is healthy in code.

- timestamp: 2026-04-15T15:37:10Z
  checked: src/hooks/useAudioPlayer.ts and src/services/audio/audioAvailability.ts
  found: The UI allows playback when either remote audio is available or `downloadedAudioBooks` includes the current book, while the player itself errors only after `getChapterAudioUrl()` cannot supply a usable asset.
  implication: UI "downloaded/can play" state can diverge from actual file availability if download bookkeeping gets out of sync.

- timestamp: 2026-04-15T15:41:00Z
  checked: live media route via `curl -I`
  found: `https://everybible.app/api/media/audio/bsb/GEN/1.m4a`, `.../bsb/EPH/1.m4a`, `.../bsb/EPH/6.m4a`, and `.../web/EPH/1.mp3` all returned `HTTP/2 200` on April 15, 2026.
  implication: The failure is likely local-device state or local-file decode related, not a missing published asset.

- timestamp: 2026-04-15T15:44:00Z
  checked: src/hooks/useAudioPlayer.ts
  found: Playback previously trusted any existing local file path and did not retry the remote chapter asset if the local file failed to load.
  implication: A stale/corrupt downloaded file could permanently block playback even though a healthy remote chapter file existed.

## Resolution

root_cause: Most likely a stale or corrupted local BSB Ephesians download. The player preferred the local file whenever it existed, but it had no recovery path to retry the working remote chapter asset if that local file was invalid.
fix: Added a local-file recovery path in `src/hooks/useAudioPlayer.ts`. If a downloaded `file://` chapter fails to load, the app now resolves the matching remote chapter URL, retries playback immediately, and deletes the broken local file after the remote fallback succeeds.
verification: `node --test --import tsx src/services/audio/audioRemote.test.ts src/services/audio/audioDownloadService.test.ts src/hooks/useAudioPlayerSource.test.ts`; `npx eslint src/hooks/useAudioPlayer.ts src/hooks/useAudioPlayerSource.test.ts`; `npm run typecheck`
files_changed:
  - src/hooks/useAudioPlayer.ts
  - src/hooks/useAudioPlayerSource.test.ts

## Follow-up

- timestamp: 2026-04-15T16:05:00Z
  checked: src/stores/bibleStore.ts and src/screens/bible/TranslationPickerList.tsx
  found: BSB was explicitly blocked from `deleteTranslation`, and the translation picker had no visible remove-download action even when local audio files existed.
  implication: Users could get stuck with stale BSB download state and no in-app way to clear and rebuild it.

- timestamp: 2026-04-15T16:08:00Z
  checked: src/stores/bibleStoreModel.ts, src/stores/bibleStore.ts, and src/screens/bible/TranslationPickerList.tsx
  found: Added a real remove-download path that clears local text-pack files, local audio directories, and persisted download jobs, while preserving bundled BSB readability. The picker now shows a destructive reset action only when a translation actually has removable local assets.
  implication: Users can now clear broken BSB downloads and re-download fresh audio without uninstalling the app or losing bundled text access.
