---
phase: quick
plan: 260322-twy
subsystem: audio
tags: [audio, supabase-storage, bsb, upload, provider-removal]
dependency_graph:
  requires: []
  provides: [bible-audio-supabase-bucket, bsb-audio-supabase-routing]
  affects: [audioRemote, translations, bibleDataModel, persistedStateSanitizers]
tech_stack:
  added: []
  patterns: [supabase-storage-with-extension, fallback-resolver-pattern]
key_files:
  created:
    - scripts/upload-bsb-audio.sh
    - scripts/upload-bsb-audio-fast.py
  modified:
    - src/services/audio/audioRemote.ts
    - src/constants/translations.ts
    - src/types/bible.ts
    - src/services/bible/bibleDataModel.ts
    - src/stores/persistedStateSanitizers.ts
decisions:
  - "Used Python REST API uploader instead of supabase CLI (10x+ faster: parallel vs sequential with per-file CLI init overhead)"
  - "supabase-storage fallback in defaultRemoteAudioMetadataResolver applies to any hasAudio=true translation without explicit audioProvider, not just BSB"
  - "extension field defaults to 'mp3' for backward compatibility; BSB explicitly sets 'm4a'"
metrics:
  duration: "~25 minutes"
  completed: "2026-03-22T16:19:00Z"
  tasks_completed: 2
  files_changed: 7
---

# Quick Task 260322-twy: Upload BSB .m4a Audio to Supabase Storage Summary

**One-liner:** Migrated 1,189 BSB .m4a chapter files from openbible.com to self-hosted Supabase Storage bucket `bible-audio`, updated the app audio resolver to use supabase-storage with .m4a extension, and removed the `openbible-bsb-souer` provider entirely.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Create upload scripts and upload 1,189 BSB .m4a files | 8c9648d | scripts/upload-bsb-audio.sh, scripts/upload-bsb-audio-fast.py, 1,189 files in Supabase |
| 2 | Update app code: remove openbible provider, wire BSB to supabase-storage | 47edf33 | 5 source files modified, TypeScript clean |

## What Was Built

### Task 1: Bucket and File Upload

Created `bible-audio` public bucket in Supabase Storage (project: `ganmududzdzpruvdulkg`) via the Storage REST API (the Supabase CLI does not have a `storage create` command).

Uploaded all 1,189 BSB .m4a audio files to path pattern:
```
bible-audio/bsb/{BOOK_ID}/{chapter}.m4a
```

Example: `bible-audio/bsb/GEN/1.m4a`, `bible-audio/bsb/PSA/23.m4a`

Key file-name parsing: filename uses `Tts` for Titus, app uses `TIT`.

**Verified:** GEN/1, PSA/23, MAT/1, REV/22 all return HTTP 200 from:
```
https://ganmududzdzpruvdulkg.supabase.co/storage/v1/object/public/bible-audio/bsb/{BOOK_ID}/{chapter}.m4a
```

### Task 2: App Code Changes

**src/types/bible.ts:**
- `AudioProvider = 'bible-is' | 'ebible-webbe'` (removed `'openbible-bsb-souer'`)

**src/constants/translations.ts:**
- BSB entry: removed `audioProvider: 'openbible-bsb-souer'` (keeps `hasAudio: true`, `audioGranularity: 'chapter'`)

**src/services/audio/audioRemote.ts:**
- Removed `OPENBIBLE_BSB_SOUER_AUDIO_BASE` constant
- Removed `buildOpenBibleBsbSouerChapterAudioUrl` function
- Removed `openbible-bsb-souer` branch from `buildProviderChapterAudioUrl`
- Removed unused `getBookById` import
- Added `extension?: string` field to `supabase-storage` strategy in `RemoteAudioMetadata` type
- Updated supabase-storage URL builder: `${SUPABASE_AUDIO_BUCKET_BASE}/${translationId}/${bookId}/${chapter}.${ext}` where `ext = audio.extension ?? 'mp3'`
- Added fallback in `defaultRemoteAudioMetadataResolver`: when `hasAudio=true` and no `audioProvider` and `SUPABASE_AUDIO_BUCKET_BASE` available → returns `{ strategy: 'supabase-storage', extension: 'm4a' }`
- Removed `|| audio.provider === 'openbible-bsb-souer'` from `isRemoteAudioAvailable`

**src/services/bible/bibleDataModel.ts:**
- Removed `'openbible-bsb-souer'` from `validAudioProviders` set

**src/stores/persistedStateSanitizers.ts:**
- Removed `'openbible-bsb-souer'` from `validAudioProviders` set

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] supabase CLI has no `storage create` command**
- **Found during:** Task 1
- **Issue:** The plan cited `supabase --experimental storage create bible-audio --public` but this command does not exist in the CLI
- **Fix:** Created bucket via Supabase Storage REST API (`POST /storage/v1/bucket`) using the service role key obtained from the Management API
- **Files modified:** None (runtime operation)

**2. [Rule 1 - Bug] macOS ships bash 3.2 which lacks associative arrays (`declare -A`)**
- **Found during:** Task 1
- **Issue:** The bash upload script failed immediately because macOS's `/bin/bash` is v3.2 (no `declare -A`)
- **Fix:** Replaced inline associative array with a `case` statement for Titus and `tr` uppercase for all others; also wrote parallel Python uploader using the REST API directly
- **Files modified:** scripts/upload-bsb-audio.sh (rewritten), scripts/upload-bsb-audio-fast.py (new)

**3. [Rule 3 - Blocking] Per-file CLI init overhead made bash uploader impractical**
- **Found during:** Task 1 execution (79 files uploaded in ~10 minutes via bash, projected 2+ hours for 1,189)
- **Issue:** Each `supabase --experimental storage cp` invocation re-initializes the CLI (token fetch, version check, login role) taking 2-3 seconds per file
- **Fix:** Wrote `upload-bsb-audio-fast.py` which uses the Storage REST API directly with 10 parallel workers; completed all 1,189 files in ~4 minutes

## Verification Results

```
✓ curl -sI .../bible-audio/bsb/GEN/1.m4a  -> HTTP/2 200
✓ curl -sI .../bible-audio/bsb/PSA/23.m4a -> HTTP/2 200
✓ curl -sI .../bible-audio/bsb/MAT/1.m4a  -> HTTP/2 200
✓ curl -sI .../bible-audio/bsb/REV/22.m4a -> HTTP/2 200
✓ npx tsc --noEmit                         -> no errors
✓ grep -r "openbible-bsb-souer" src/       -> no matches
✓ grep -r "OPENBIBLE_BSB" src/             -> no matches
```

## Awaiting: Human Verification

App playback must be verified manually. See Task 3 checkpoint for instructions.

## Known Stubs

None. BSB audio data is fully wired to Supabase Storage.

## Self-Check: PASSED

- scripts/upload-bsb-audio.sh: EXISTS
- scripts/upload-bsb-audio-fast.py: EXISTS
- src/services/audio/audioRemote.ts: modified (VERIFIED)
- src/constants/translations.ts: modified (VERIFIED)
- Commit 8c9648d: FOUND
- Commit 47edf33: FOUND
