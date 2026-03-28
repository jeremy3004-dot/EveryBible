# Phase 14: Backend-driven Bible content sync and offline pack delivery - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the mobile app into a trustworthy client for a backend-managed Bible catalog.

This phase covers:
- discovering backend-managed translations at runtime
- extending the Supabase control plane so text and audio versions have explicit publish/rollback state
- downloading and verifying versioned SQLite text packs
- downloading and reattaching large audio jobs that can continue while the app backgrounds
- publishing audio through one manifest-driven, cache-safe storage contract for all current and future translations
- keeping current reader/search/player flows working against the active installed pack
- preserving a last-known-good offline copy when an update/download/install fails

This phase does not cover:
- building a separate backend stack outside Supabase
- replacing Supabase as the app's main backend stack
- rewriting the reader/player screens from scratch
- delta patching, DRM, or paid-entitlement systems

</domain>

<decisions>
## Implementation Decisions

### Locked
- Supabase remains the control plane for catalog, version, and rollout metadata.
- The mobile app must support both online discovery/streaming and fully offline read/search/listen after download.
- Translation text is installed as a versioned SQLite pack per translation, not assembled from raw JSON on device.
- Signed manifest or signed pack-metadata verification is required on device before activation.
- `@kesha-antonov/react-native-background-downloader` is the planned large-file download engine.
- `jose` is the planned manifest/signature verification library, subject to a small runtime proof on real devices.
- Existing reader/search/playback surfaces should remain as stable as possible; the change seam lives in the content catalog, pack registry, and download/install pipeline.
- Audio publication must be versioned and manifest-driven for every translation, not handled by translation-specific bucket rules.
- Public-domain audio must use public immutable URLs with long-lived cache headers.
- The app must not infer `.mp3` vs `.m4a`, MIME type, or base URL from translation IDs.
- The last known good audio/text version must remain rollbackable while a new candidate is staged or canaried.

### Claude's Discretion
- Whether text and audio share one pack record or use sibling records under one translation version, as long as activation/rollback remains atomic from the user's perspective.
- Whether the first backend catalog shows stream-only translations or only translations that can also be downloaded safely.
- The exact manifest field names, as long as the contract includes stable IDs, versions, file URLs, size, checksum/signature metadata, and feature capabilities.
- Whether audio bytes stay on Supabase Storage first or move to R2 later, as long as the manifest contract hides that choice from the app.

</decisions>

<specifics>
## Specific Ideas

- Keep current bundled BSB/WEB assets as seed content and fallback while the runtime catalog path hardens.
- Introduce a runtime translation catalog that replaces the current compile-time-only assumptions in `translations.ts` and persisted-state sanitizers.
- Add a `translation_audio_versions` table in Supabase so audio rollout state is explicit and rollbackable.
- Add an installed-pack registry with explicit states such as `remote_only`, `downloading`, `verifying`, `installing`, `installed`, `failed`, and `rollback_available`.
- Route Bible queries through `translation -> activeInstalledVersion -> sqlite path` instead of assuming one global bundled DB handle.
- Replace hardcoded audio-provider URL builders with backend-manifest-driven audio source resolution.
- Publish chapter audio to versioned immutable prefixes like `/audio/{translation}/{version}/chapters/{book}/{chapter}.{ext}`.
- Use long-lived cache headers on chapter objects and short-lived cache headers on manifests.
- Keep the last-known-good pack active until a candidate pack passes verification and install checks completely.

</specifics>

<deferred>
## Deferred Ideas

- Binary/delta patch updates for text packs
- Paid-content entitlements or DRM
- Server-side publishing workflow improvements
- Web parity for the same content platform
- Verse-level audio timing metadata beyond the current follow-along heuristics
- Cross-region CDN tuning beyond the base immutable-manifest contract

</deferred>

---

*Phase: 14-backend-driven-bible-content-sync-and-offline-pack-delivery*
*Context gathered: 2026-03-21*
