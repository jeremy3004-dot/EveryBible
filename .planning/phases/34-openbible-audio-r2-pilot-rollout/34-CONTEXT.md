# Phase 34: OpenBible audio R2 pilot rollout — Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Source:** Local repo inspection + `/Volumes/Extreme SSD/OpenBible` manifest audit

<domain>
## Phase Boundary

Ship a small, deliberate pilot of OpenBible audio into EveryBible's Cloudflare R2 stack so the app can stream or download the selected translations through the existing `catalog.audio` + `catalog.timing` contract.

**In scope:**
- Pick a first-wave pilot set and track it in-repo so future runs skip completed translations
- Normalize raw OpenBible book ZIPs into app-facing chapter assets
- Publish versioned R2-ready object paths and catalog payloads
- Support audio-only runtime translations for rows that do not yet have text packs
- Smoke test the end-to-end contract from staged files -> R2 object keys -> app URL resolution

**Out of scope:**
- Bulk rollout of all 235 translations
- Uploading the full raw ZIP archive into R2
- Reworking the mobile player to understand raw OpenBible ZIPs directly
- Full operational publish of the pilot in this planning pass

</domain>

<decisions>
## Implementation Decisions

### Pilot set
Use the smallest high-value, low-risk set that matches the user's ask and the local corpus quality scan:

- `npiulb` — Nepali Unlocked Literal Bible (requested explicitly; NT-only audio)
- `hincv` — Hindi Contemporary Version
- `hin2017` — Hindi Indian Revised Version (merged OT + NT source IDs)
- `benbcv` — Biblica Open Bengali Contemporary Version
- `benirv` — Bengali Indian Revised Version
- `urdirv` — Urdu Indian Revised Version
- `arbkehm` — Ketab El Hayat Majani (Arabic)

### Storage contract
- Publish only normalized app-facing assets now, not raw OpenBible ZIPs
- Use immutable versioned object paths:
  - `audio/{translationId}/{version}/chapters/{bookId}/{chapter}.mp3`
  - `timing/{translationId}/{version}/{bookId}/{chapter}.json`
- Generate operator manifests and catalog payloads alongside staged assets
- For live R2 publish, prefer `rclone` over `s5cmd` for this corpus. `s5cmd` hit R2 `400 BadRequest` failures during pilot publish, while `rclone` worked once configured with Cloudflare S3 mode plus `--s3-no-check-bucket`, `--s3-disable-checksum`, and explicit `Cache-Control` upload headers.

### Timing policy
- Publish timing only when the selected pilot translation has full timing coverage for the staged audio set
- Explicitly disable timing for:
  - `hin2017` (partial timing only)
  - `arbkehm` (no timing)

### App availability constraint
The current Supabase runtime-catalog filter hides translations that do not have a current text version row, even if they have valid audio catalogs. The pilot therefore needs one small app-side filter adjustment so audio-only runtime translations can appear without inventing fake text versions.

### Registry
Keep the pilot set in a machine-readable repo file so future publish runs can skip `published` or `verified` translations automatically and so the next batch can be added intentionally.

### Future publish guard
- Future `--upsert-catalog` runs must verify that the referenced R2 audio/timing/text objects are already reachable before writing `translation_catalog`.
- Pilot registry entries should carry stable `sortOrder` values so runtime catalog ordering does not depend on database defaults or manual SQL patches.
- Published text-pack runtime rows should be installable from catalog metadata alone; they should not stay hidden just because `translation_versions` was not updated in the same operator pass.

</decisions>

<canonical_refs>
## Canonical References

- `docs/bible-media-platform-policy.md`
- `apps/site/lib/bible-media.ts`
- `apps/site/lib/r2-text-pack-manifest.json`
- `scripts/import-open-bible-audio.ts`
- `scripts/publish-bible-assets-r2.ts`
- `scripts/upsert-translation-catalog.ts`
- `src/services/audio/audioRemote.ts`
- `src/services/bible/verseTimestamps.ts`
- `src/services/translations/translationCatalogModel.ts`
- `/Volumes/Extreme SSD/OpenBible/manifest.json`

</canonical_refs>

<specifics>
## Specific Ideas

- Stage pilot output under `tmp/open-bible-r2-pilot/<translationId>/<version>/...` so we never mix future pilot work with the older one-off importer output
- Generate per-translation:
  - `catalog.json`
  - `manifest.audio.json`
  - `translation-catalog-row.json`
  - `publish-plan.json`
- Keep the first smoke pass small by supporting a per-translation chapter sample limit without marking the registry as staged or published

</specifics>

<deferred>
## Deferred Ideas

- Uploading raw OpenBible ZIP artifacts to a cold-storage archive prefix in R2
- Full per-chapter SHA/duration generation for every pilot object
- A second wave of translations after the first 7 publish and verify cleanly

</deferred>
