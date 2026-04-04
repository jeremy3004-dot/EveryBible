# Bible Media Platform Policy

## Purpose

This policy defines how EveryBible publishes, stores, delivers, updates, and rolls back Bible text and audio assets.

It applies to:

- current built-in translations such as BSB and WEB
- all future public-domain translations we import
- any future licensed audio we add later

The goal is simple: every Bible should use the same backend delivery contract so the app does not grow translation-specific hacks.

## Non-Negotiable Rules

1. The app must never hardcode translation-specific audio URL builders.
2. Every text or audio release must be versioned.
3. Published media objects are immutable. New bytes require a new versioned path.
4. The client must read delivery details from backend manifest metadata, not infer file extensions, MIME types, or bucket paths.
5. A new version must not replace the current version until verification and canary checks pass.
6. A previous good version must remain available for rollback.
7. `translation_catalog.has_audio` must only be true when a healthy current audio version exists.
8. Public-domain audio must use cacheable public CDN URLs. Do not generate one signed URL per chapter.
9. Playlists must reference the same chapter assets as books/translations. Do not duplicate chapter audio for playlists.
10. The storage provider may change, but the client contract may not.

## Target Architecture

### Control Plane: Supabase

Supabase remains the control plane for:

- translation catalog metadata
- current text version metadata
- current audio version metadata
- manifest URLs and checksums
- rollout flags and availability

Recommended schema shape:

- `translation_catalog`
  - human metadata and user-facing availability
- `translation_versions`
  - text pack versions
- `translation_audio_versions`
  - audio pack versions, manifest URL, checksum/signature metadata, delivery mode, storage provider, and current-version flag

The mobile app should only ask Supabase, “what is the current text/audio version for this translation?” It should not care that the published bytes now come from Cloudflare R2.

### Media Plane: CDN-Backed Object Storage

The media plane can be:

- Supabase Storage with correct cache headers
- Cloudflare R2 behind a custom CDN domain
- another bucket/CDN later

What matters is the contract:

- versioned immutable object paths
- byte-range support
- stable public URLs for public-domain assets
- manifest-driven lookup

Current repo wiring:

- mobile/runtime asset resolution uses `EXPO_PUBLIC_BIBLE_ASSET_BASE_URL`
- translation catalogs may now store relative asset paths such as `audio/npiulb` or `text/npiulb/app.sqlite`
- R2 publishing is handled by `scripts/publish-bible-assets-r2.ts`, which syncs local Bible artifacts into the configured bucket, emits R2-flavored catalog files for staged imports, and regenerates `apps/site/lib/r2-text-pack-manifest.json` from the live `text/` objects in R2
- the manifest can also be regenerated directly with `npm run manifest:text-packs` when operators need to realign the committed control-plane metadata with the bucket contents
- the public delivery surface is now `https://everybible.app/api/media/...`, backed by the site app's server-side R2 proxy
- the site app requires `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in Vercel to serve that proxy in production

Recommended path shape:

```text
/audio/{translation_id}/{audio_version}/chapters/{book_id}/{chapter}.{ext}
```

Example:

```text
/audio/bsb/v2026-03-26-1/chapters/JHN/3.m4a
```

## Cache Policy

### Chapter Objects

All published chapter objects must use:

```text
Cache-Control: public, max-age=31536000, immutable
```

Requirements:

- never publish chapter objects with `no-cache`
- never overwrite bytes at an existing published path
- keep `Accept-Ranges: bytes` working

### Manifests

Manifests should have a short TTL because they are the release-control surface:

```text
Cache-Control: public, max-age=300, stale-while-revalidate=60
```

Manifest URLs may stay stable if their contents are version-aware. The chapter objects themselves must remain immutable.

## Manifest Contract

Every audio version must publish one manifest that contains enough data for:

- streaming
- offline chapter downloads
- book download planning
- whole-Bible download planning
- playlist resolution
- verification
- rollback

Minimum fields:

```json
{
  "translation_id": "bsb",
  "audio_version": "v2026-03-26-1",
  "delivery_mode": "chapter",
  "storage_provider": "supabase-public",
  "base_url": "https://media.everybible.app/audio/bsb/v2026-03-26-1",
  "file_ext": "m4a",
  "mime_type": "audio/mp4",
  "cache_control": "public, max-age=31536000, immutable",
  "total_books": 66,
  "total_chapters": 1189,
  "total_bytes": 1034300000,
  "books": {
    "JHN": {
      "total_chapters": 21,
      "total_bytes": 18423000,
      "chapters": [
        {
          "chapter": 3,
          "path": "chapters/JHN/3.m4a",
          "bytes": 1125838,
          "sha256": "…",
          "duration_ms": 223145
        }
      ]
    }
  }
}
```

If we later support licensed content, the manifest can switch to signed or tokenized delivery without changing the client contract.

## Client Delivery Rules

### Streaming

- Fetch the current catalog and audio-version metadata once.
- Fetch one manifest per translation/version.
- Stream the requested chapter directly from the manifest URL.
- Prefer local files over remote URLs once downloaded.

### Offline Downloads

- Use chapter-level files, not ZIP archives, for the default path.
- Download with bounded concurrency, not serial chapter-by-chapter execution.
- Recommended initial concurrency: `4` on mobile, configurable to `6` after device validation.
- Persist per-file progress and retry state.
- Mark a book or translation complete only after manifest completeness checks pass.

### Playlists

- A playlist is a list of manifest chapter references.
- Playlist download planning must de-duplicate chapter files already downloaded by book or translation.
- Playback should start immediately from remote if needed while the next one or two tracks prefetch.

## Supabase Policy

Supabase should own:

- version rows
- publish flags
- rollout metadata
- catalog filtering
- future entitlement metadata if needed

Supabase should not be the place where the client reverse-engineers delivery paths.

Required backend rules:

- do not mark `has_audio = true` until a current audio version row exists and health checks pass
- do not expose orphan catalog rows without a current version
- do not publish translation-specific delivery logic into the app
- do not rely on mutable bucket paths as release control

## Storage Provider Policy

### Current State

The current production direction is:

- keep Supabase as the control plane
- publish all current translation text packs to Cloudflare R2
- mirror all current public-domain chapter audio to Cloudflare R2
- serve Bible assets through `https://everybible.app/api/media/...`
- treat translation catalog metadata plus R2 objects as the source of truth

### Future Provider Swaps

If traffic, pricing, or CDN behavior warrants another provider later:

- keep Supabase tables and catalog rows as the contract surface
- migrate object storage behind the same catalog-driven paths
- update only the publishing pipeline and media proxy internals

This preserves the client contract and avoids another app rewrite.

## New Translation Onboarding Checklist

Every future translation/audio import must pass this checklist:

1. Assign a stable `translation_id`.
2. Create a new text version row if text changes.
3. Create a new audio version row if audio changes.
4. Upload audio to a new versioned object prefix.
5. Apply immutable cache headers on chapter objects.
6. Generate a manifest with bytes, checksums, durations, and chapter paths.
7. Run health checks:
   - repeated `HEAD` requests
   - byte-range request
   - completeness count vs expected chapter count
   - sample TTFB from target region
8. Publish the new version as non-current first.
9. Canary the version in app.
10. Flip `is_current` only after canary success.
11. Retain the previous current version until the next release window is stable.

## Anti-Patterns We Are Explicitly Banning

- `cache-control: no-cache` on public chapter audio
- per-translation URL logic in `audioRemote.ts`
- assuming all downloaded audio files are `.mp3`
- serial whole-Bible chapter downloads
- mutating bytes in place at a stable object path
- exposing audio-capable translations before their version rows and manifests are healthy
- forcing the client to know bucket internals

## Immediate High-Leverage Fixes

These should happen first because they improve BSB now and become the base policy for everything after it:

1. Keep every current translation catalog pointed at an R2-backed text pack before release.
2. Keep public-domain chapter audio mirrored into R2 before `has_audio` is exposed.
3. Move audio and timing resolution entirely through catalog metadata and media proxy paths.
4. Replace serial chapter downloads with bounded concurrency.
5. Normalize extension and MIME handling from manifest data.
5. Add control-plane rows for current audio version and manifest URL.
