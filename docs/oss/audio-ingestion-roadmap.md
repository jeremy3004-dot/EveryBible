# OSS Audio and Ingestion Roadmap

## Scope

This roadmap covers open-source audio playback and content-ingestion options for EveryBible without changing native code or adding dependencies now.

Owned decisions:

- prepare for `react-native-track-player` after the app is ready for a custom native development client or bare workflow
- use Docling only in server-side ingestion jobs, never in the mobile runtime
- use eBible, CrossWire/SWORD, and STEPBible as ingestion sources or data-shape patterns, not as client-side dependencies
- keep EveryBible's manifest-driven media contract from `docs/bible-media-platform-policy.md` as the boundary between ingestion and the app

Out of scope for this document:

- installing `react-native-track-player`
- changing Expo/native configuration
- adding Docling, SWORD, or STEPBible packages
- changing audio playback code, workflow tasks, or database schema

## Repo Evidence

The current app is already positioned for a later audio backend swap:

- `src/services/audio/trackPlayer.ts` exposes a `react-native-track-player`-shaped API over `expo-av`. The file explicitly says the real package needs custom Swift/Kotlin code and should replace this wrapper only after leaving the current managed constraint.
- `src/services/audio/audioPlayer.ts` keeps the public audio surface narrow: configure, callbacks, load/play, pause/resume, stop, seek, rate, status, and loaded-state checks. This is the right boundary for a later Track Player migration.
- `docs/bible-media-platform-policy.md` requires versioned immutable chapter objects, manifest-driven delivery, byte-range support, rollout gates, rollback availability, and no translation-specific audio URL logic in the client.
- `packages/langquest-ingest` already normalizes audio segments into canonical book/chapter/verse manifests, computes SHA-256 checksums, validates safe IDs and verse ranges, and adapts LangQuest output into an EveryBible audio-version manifest.
- `apps/workflows/src/tasks/langquest.ts` already demonstrates the desired server workflow shape: discover candidates, select translations, copy verified source audio into R2 with immutable cache headers, write per-chapter manifests, promote an audio manifest, and keep publish state separate from ingestion state.
- `scripts/import-open-bible-audio.ts` shows a source-specific importer pattern: fetch source manifests, stage chapter files, normalize naming, validate expected NT audio/timing counts, and emit catalog metadata.

## OSS Scout Summary

Recommended classifications:

| Option | Role | License posture | Classification |
| --- | --- | --- | --- |
| `react-native-track-player` | Native mobile playback engine later | MIT package, but requires native integration and release testing | Adopt later |
| Docling | Server-side document conversion for PDFs, Office docs, HTML, scans | MIT project; keep transitive model/package review in CI | Self-host as service/worker |
| eBible.org | Bible text/audio source and distribution reference | Per-translation licenses vary; some are public domain, CC, restricted, or non-commercial | Source adapter only |
| CrossWire/SWORD | Module format and metadata pattern | SWORD engine is GPL-family risk; module licenses vary via `DistributionLicense` | Copy metadata pattern, avoid embedding engine |
| STEPBible Data | Lexical/cross-reference/source data pattern | CC BY 4.0 data attribution required | Source adapter/data import pattern |

## Playback Roadmap

### Phase 0: Keep Current Expo Audio Wrapper

Do now:

- Continue writing app playback code against `src/services/audio/audioPlayer.ts`.
- Keep `src/services/audio/trackPlayer.ts` as the compatibility shim while the app remains constrained by Expo managed/native-code policy.
- Do not expose direct `expo-av` assumptions outside the audio service layer.

Gate to leave Phase 0:

- A product decision exists to support a custom development client or bare workflow.
- iOS and Android release builds can be produced and tested with native audio modules.
- Background playback, lock-screen controls, remote pause/play, interruption handling, and seek behavior have a release test plan.

### Phase 1: Track Player Spike

Do later, in a separate branch:

- Replace only the shim boundary with `react-native-track-player`.
- Keep `audioPlayer.ts` as the stable app-facing facade unless a missing capability forces a typed API change.
- Map existing wrapper events to real Track Player events: playback state, progress, queue end, active track changes, remote play/pause/seek, and playback errors.
- Preserve single-track behavior first; add queue features only after parity is proven.

Rollout gates:

- Existing audio hooks and controls pass unchanged on iOS and Android.
- Remote controls work from lock screen, notification, headphones, and control center.
- Playback survives backgrounding, interruption, route changes, app relaunch, and poor network.
- Streaming still honors manifest URLs and byte-range delivery.
- Offline files are preferred over remote URLs when available.

Rollback:

- Keep the existing `expo-av` shim on a release branch until Track Player has passed one full production release window.
- If native failures appear, revert the shim replacement and keep the app-facing `audioPlayer.ts` contract intact.

## Ingestion Roadmap

### Phase 0: Preserve Manifest Contract

Every source adapter must emit or promote into the same EveryBible media contract:

- stable `translation_id`
- immutable `audio_version` or text version
- manifest URL and SHA-256 checksum
- canonical book IDs, chapter numbers, verse ranges where applicable
- byte sizes, MIME types, file extensions, and cache policy
- source provenance and source license metadata
- publish state separated from ingest/readiness state

Do not let source-specific URL templates leak into the mobile app.

### Phase 1: Normalize Existing Source Adapters

Use the LangQuest and Open.Bible patterns as the baseline:

- discovery task finds candidate source material
- selected ingest task stages data into R2 or local staging
- validation checks completeness, source checksums, canonical references, and MIME types
- promotion task writes a versioned manifest and updates publish metadata
- catalog exposure happens only after health checks pass

Recommended next cleanup:

- Require every source adapter to produce a shared ingest summary with `source`, `source_url`, `source_license`, `translation_id`, coverage, object count, byte count, checksum, warnings, and validation result.
- Keep source-specific parsing isolated under scripts/packages/workflows, not in mobile services.

### Phase 2: Docling Server-Side Ingestion

Use Docling for document conversion when source materials arrive as PDFs, Office documents, HTML, scans, or mixed document bundles.

Architecture:

- run Docling in a server-side worker, batch job, or MCP-backed ingestion service
- upload original source files to private staging storage
- convert to Markdown/JSON plus structured metadata
- feed normalized text/tables/segments into source-specific validators
- preserve source file checksums and Docling output checksums
- store outputs as staging artifacts until reviewed and promoted

Hard limits:

- Do not put Docling in the React Native app.
- Do not make Docling output publishable by default.
- Do not trust OCR/table extraction without human or deterministic validation for canonical scripture references.

Rollout gates:

- Conversion is deterministic enough for repeat runs or records drift clearly.
- Every generated verse/chapter mapping validates against canonical book/chapter counts.
- License and attribution fields are captured before promotion.
- Failed conversions stay private and cannot set `has_audio` or equivalent availability flags.

Rollback:

- Keep original source files and previous promoted manifests.
- If a Docling conversion is bad, delete or quarantine the staging artifact and leave the current published version unchanged.

## Source Patterns

### eBible.org

Use as a text/audio source catalog and distribution pattern. eBible provides many formats and explicitly notes that permissions vary by translation; freely shareable sources may be public domain or Creative Commons, while restricted translations need separate handling.

Good fit:

- public-domain or explicitly redistributable translations
- source catalogs with hashes/signatures
- HTML/USFM/SWORD-style source formats
- audio where license and redistribution terms are explicit

Risks:

- License terms are per translation, not globally safe.
- Some licenses may be non-commercial or no-derivatives.
- Trademark/name restrictions can apply even when text is freely usable.
- A source being downloadable does not mean EveryBible can redistribute it through its own CDN.

Gate:

- Require per-translation license record, attribution text, allowed redistribution mode, derivative policy, and proof URL before ingest promotion.

### CrossWire/SWORD

Use CrossWire/SWORD as a module metadata and content-packaging pattern. Avoid embedding GPL SWORD engine code into the app unless legal review explicitly approves it.

Good fit:

- metadata fields such as language, description, source text, and `DistributionLicense`
- module discovery and import-side parsing
- comparison source for existing Bible app ecosystem expectations

Risks:

- SWORD engine/license posture can create GPL obligations if embedded.
- Module licenses vary independently of the engine.
- Module format support in ingestion can become a maintenance burden if treated as a runtime dependency.

Gate:

- Parse modules server-side or in scripts only.
- Persist original module metadata and license fields.
- Promote only modules with acceptable redistribution rights and validated canonical coverage.

### STEPBible

Use STEPBible Data as an enrichment/source-data pattern for names, lexical data, cross references, and structured study metadata. Its data repository is CC BY 4.0, so attribution and change tracking are required.

Good fit:

- study-data enrichment
- named entities, lexical links, cross references, and source-language metadata
- reference model for structured Bible data organization

Risks:

- CC BY attribution must be visible and auditable.
- Modified data requires clear change tracking.
- It is not primarily an audio source.

Gate:

- Add attribution metadata to any promoted derived dataset.
- Keep source revision, changed fields, and transform version in the ingest summary.

## License Risk Controls

Required metadata before any source can promote:

- source name and URL
- upstream owner/publisher
- license identifier and license URL
- redistribution allowed: yes/no/conditional
- commercial use allowed: yes/no/unknown
- derivatives allowed: yes/no/conditional
- attribution text
- trademark/name restrictions
- source checksum or signed hash when available
- reviewer and review date

Reject or quarantine:

- unknown license
- non-commercial license for app-distributed content unless product/legal explicitly accepts the constraint
- no-derivatives sources when transforms, segmentation, or text normalization would create derivative risk
- GPL/AGPL engine code in mobile or proprietary server components without legal approval
- source-available material that is not OSI-compatible but is presented as open source

## Rollout Gates

A new audio or ingestion source can become user-visible only after:

- source license metadata is complete and reviewed
- staged artifacts are immutable and versioned
- manifest checksum matches uploaded manifest bytes
- chapter or segment counts match expected canonical coverage for the declared scope
- random sample playback or text rendering passes
- byte-range requests work for audio files
- CDN/cache headers match policy
- Supabase/catalog state points to a non-current candidate first
- canary validation passes
- previous good version remains available

## Rollback

Rollback must be metadata-first:

- flip current catalog/audio-version metadata back to the last known good version
- leave immutable objects in place for audit and cache stability
- mark failed candidate versions as rejected or quarantined
- preserve workflow run output and ingest summaries
- do not overwrite published paths
- do not delete the previous current version during the release window

Emergency client rollback is only needed if the playback engine migration itself fails. Source-ingestion failures should be recoverable through catalog/version metadata.

## Acceptance Checklist

Before this roadmap is considered implemented:

- `audioPlayer.ts` remains the app-facing playback boundary.
- Track Player adoption has a native release test matrix and rollback branch.
- Docling runs only in server-side ingestion, never mobile.
- Every source adapter writes license and provenance metadata.
- eBible, CrossWire, and STEPBible are treated as ingestion/source patterns, not runtime app dependencies.
- Promotion cannot set public availability without manifest, checksum, coverage, cache, byte-range, and canary checks.
- Previous good text/audio versions remain available for rollback.
- Documentation and operator runbooks are updated when a new source adapter or playback engine is actually added.

## Reference Links

- React Native Track Player installation: https://rntp.dev/docs/4.0/basics/installation
- React Native Track Player repository: https://github.com/doublesymmetry/react-native-track-player
- Docling project: https://docling-project.github.io/docling/
- Docling technical report: https://arxiv.org/abs/2408.09869
- eBible.org about and permissions: https://ebible.org/about.php
- eBible.org certified files/signatures: https://ebible.org/certified/
- CrossWire SWORD module metadata: https://crosswire.org/sword/develop/swordmodule/
- STEPBible Data repository: https://github.com/STEPBible/STEPBible-Data
