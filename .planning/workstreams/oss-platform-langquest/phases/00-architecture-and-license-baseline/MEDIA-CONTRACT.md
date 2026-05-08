# Media Contract

## Phase 5 Ingest Namespace

LangQuest artifacts first land in a quarantined R2 namespace:

```text
langquest/ingest/{source_translation_id}/{checksum}/chapters/{book_id}/{chapter}/segments/{seq}-{verse_label}-{slug}.{ext}
langquest/ingest/{source_translation_id}/{checksum}/chapters/{book_id}/{chapter}/manifest.json
langquest/ingest/{source_translation_id}/latest.json
```

Rules:

- Content-addressed paths are immutable.
- `latest.json` may change as a pointer.
- Ingest artifacts are not app-visible publishing contracts.
- Missing/local-only audio produces `not_ready` status with reasons.

## Phase 6 Promotion Namespace

Approved artifacts are promoted into the EveryBible media contract:

```text
audio/{translation_id}/{audio_version}/chapters/{book_id}/{chapter}.{ext}
audio/{translation_id}/{audio_version}/segments/{book_id}/{chapter}/{seq}.{ext}
manifests/audio/{translation_id}/{audio_version}.json
```

Rules:

- Current app compatibility requires chapter-level files or an app change for segment playback.
- Per-segment assets may be preserved for future timing/playlist features.
- Catalog publication updates Supabase control-plane metadata only after validation.
- Rollback uses catalog/pointer changes, not byte mutation.

## Manifest Fields

Minimum LangQuest ingest manifest:

- `schema_version`
- `source`
- `project`
- `language`
- `chapter`
- `segments`
- `warnings`
- `not_ready_reasons`
- `created_at`

Each segment:

- `seq`
- `asset_id`
- `content_link_id`
- `verse_from`
- `verse_to`
- `transcript`
- `audio[]`

Each audio item:

- `take`
- `canonical`
- `source_supabase_key`
- `r2_key`
- `duration_ms`
- `byte_size`
- `content_type`
- `sha256`
