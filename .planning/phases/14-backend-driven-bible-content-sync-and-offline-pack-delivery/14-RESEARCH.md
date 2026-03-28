# Phase 14 Research: Backend-driven Bible content sync and offline pack delivery

**Date:** 2026-03-21
**Status:** Complete

## Summary

The current app already has the right local-first shape, but it assumes:
- one bundled SQLite Bible database
- a compile-time static translation list
- hardcoded audio providers
- foreground-only audio downloads

That means the best mobile architecture is not a rewrite. It is a controlled extension at four seams:

1. runtime translation catalog
2. installed-pack registry and versioned SQLite path resolution
3. manifest-driven audio source resolution
4. durable background download/install state

The new evidence from the live BSB incident sharpens that further: the current system is also missing a backend media policy. Without a versioned audio control plane and immutable CDN publication rules, every new translation risks repeating the same slow-download mistakes.

## Incident Evidence To Design Against

- BSB audio is currently stored in the public `bible-audio` bucket, but the live objects were uploaded with `cacheControl = 'no-cache'`.
- Repeated `HEAD` requests against the same BSB object returned `cf-cache-status: MISS`, which strongly suggests the CDN is not giving us the hot-object behavior we need.
- The object path supports `Accept-Ranges: bytes`, so range support is not the primary bottleneck.
- A sampled BSB chapter returned a time-to-first-byte of roughly 2.27s from this environment, which becomes brutal when whole-Bible downloads are serialized.
- Whole-Bible and book audio downloads are currently serialized chapter-by-chapter or book-by-book in the app.
- `audioRemote.ts` still hardcodes provider rules and falls back to synthesized Supabase paths instead of using backend-provided manifest metadata.
- The codebase drifts between `.m4a` and `.mp3` expectations, which is an avoidable contract bug.

## Updated Recommendation

Phase 14 should no longer be treated as a client-only feature sweep. It must define a reusable Bible media platform contract:

1. Supabase as the control plane for catalog rows, current text/audio versions, and manifest metadata
2. CDN-backed object storage as the media plane, accessed only through versioned manifests
3. immutable object paths with long-lived cache headers for chapter assets
4. pointer-based rollback that flips current versions instead of mutating live object paths

This keeps future translations consistent whether their bytes live in Supabase Storage first or move to R2/custom CDN later.

## Existing System Seams

### Text

- `src/services/bible/bibleDatabase.ts` owns SQLite open/import/query behavior and currently assumes one bundled DB file.
- `src/services/bible/bibleService.ts` is a thin facade and should stay stable if possible.
- `src/stores/bibleStore.ts` owns current translation selection but `downloadTranslation()` is still a stub.
- `src/constants/translations.ts` and `src/stores/persistedStateSanitizers.ts` currently assume translations are compile-time static.

### Audio

- `src/services/audio/audioRemote.ts` hardcodes provider URL rules.
- `src/services/audio/audioDownloadService.ts` and `src/services/audio/audioDownloadStorage.ts` download chapter MP3s into a local filesystem tree.
- `src/services/audio/audioService.ts` already does the correct local-first, remote-second source selection.
- `src/hooks/useAudioPlayer.ts` and `src/stores/audioStore.ts` should remain mostly unchanged if the audio source seam stays in `audioService.ts`.
- `supabase/migrations/20260322150000_create_bible_audio_bucket.sql` creates the bucket, but today there is no versioned audio manifest/control-plane schema that can publish, stage, or roll back audio versions per translation.

## Gaps To Close

- No runtime translation catalog from backend
- No text-pack install or activation flow
- No pack metadata model for version, checksum/signature, active path, rollback target, or failure reason
- No audio-version control plane in Supabase for manifest URL, storage provider, delivery mode, cache policy, or current-version pointer
- No durable install/download state across restart
- No background/reattach large-file download support
- No manifest verification step before activation
- No UI install/update states for remotely provisioned translations
- No storage publication policy that prevents `no-cache`, mutable object paths, or translation-specific URL hacks from returning

## Recommended State Model

Per translation, the client should model:

- `remote_only`
- `downloading`
- `verifying`
- `installing`
- `installed`
- `failed`
- `rollback_available`

The active reader/search/player should always point at `activeInstalledVersion`, never the in-flight candidate.

## Backend Policy Requirements

- Supabase remains the catalog/version control plane.
- Audio publication must be versioned per translation, not implied by one mutable bucket prefix.
- The client must consume `manifest_url`, `file_ext`, `mime_type`, and download totals from backend metadata instead of hardcoding `.mp3` or provider URLs.
- Public-domain audio should use public immutable URLs, not signed per-chapter URLs.
- Future storage moves, including R2, should require only manifest changes, not app rewrites.

## Package Fit

### `@kesha-antonov/react-native-background-downloader`

- Good fit for Expo SDK 54 / RN 0.81.5 / iOS 15.1.
- Meaningfully better than `expo-file-system` for large background downloads and resume/reattach behavior.
- Needs config-plugin/native review because the repo commits native projects and uses a custom `AppDelegate.swift`.

### `jose`

- Good fit for signed manifest verification.
- Prefer a narrow algorithm set and a device proof before making it load-bearing.
- If runtime constraints appear on a target device, phase can fall back to checksum verification temporarily without changing the overall pack architecture.

## Architectural Recommendations

### Minimal-Diff Seams

- Extend `bibleDatabase.ts` to resolve `translation -> sqlite file path` instead of one bundled DB.
- Replace static translation assumptions in `bibleStore.ts`, `translations.ts`, and persisted-state sanitizers with a runtime catalog plus a preserved seeded baseline.
- Keep `audioService.ts` as the single source-selection seam and feed it backend-manifest metadata instead of hardcoded providers.
- Introduce one pack-install registry instead of sprinkling install state across screens.
- Add a Supabase `translation_audio_versions` control-plane table instead of hiding audio release state inside ad hoc bucket conventions.

### Risks

1. Native/config-plugin drift when integrating the background downloader
2. JOSE runtime proof on Hermes/iOS/Android for the exact verification path
3. Silent corruption risk if install/rollback is not atomic
4. Persisted-state loss if runtime translations are not sanitized differently from compile-time translations
5. Repeating the current BSB cache/header failure if audio publication is not policy-driven and automated

## Planning Implications

This phase should be executed in four plans:

1. Supabase contract, signed-manifest/download foundation, and storage publication policy
2. SQLite text-pack install + rollback-safe routing
3. backend-driven audio source + bounded-concurrency background download lifecycle
4. UI states + release/device verification + rollback drill
