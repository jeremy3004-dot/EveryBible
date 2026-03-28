# Bible Media Rollback Runbook

## Purpose

This runbook explains how to roll back Bible text or audio delivery changes safely when a release degrades playback, downloads, cache behavior, or install integrity.

Use this for:

- broken audio after a new publish
- missing chapters or corrupted files
- bad cache headers or origin latency regressions
- broken manifests
- client regressions caused by a new backend delivery contract

## Core Rule

Rollback must happen by moving version pointers, not by mutating or deleting the current published bytes in place.

If bytes changed, they should already live at a new versioned path. Rollback means repointing the current version to the last known good release.

## Current-State Limitation

Today the repo still contains pre-policy BSB behavior:

- no dedicated `translation_audio_versions` control plane yet
- hardcoded provider/path logic still exists in app code
- some published BSB objects were uploaded with `cache-control = no-cache`

Until Phase 14 lands, emergency rollback is:

1. revert the app change
2. keep the old bucket paths intact
3. republish any broken storage change under a new versioned prefix instead of overwriting in place

The long-term rollback flow below is the target operating model.

## Pre-Rollback Checks

1. Identify the affected translation and version.
2. Confirm whether the failure is:
   - manifest/control-plane only
   - object-storage only
   - client behavior only
3. Verify the previous known-good version still exists.
4. Freeze any new publish for that translation until rollback completes.

## Operational Tools

### Supabase CLI

Use the CLI for schema and storage inspection:

```bash
supabase migration list
supabase db push --dry-run
supabase storage ls -r ss:///bible-audio/bsb
```

For uploads or staged republish:

```bash
supabase storage cp -r ./staging/bsb/v2026-03-26-1 ss:///bible-audio/bsb/v2026-03-26-1 \
  --jobs 8 \
  --cache-control "public, max-age=31536000, immutable"
```

If the object MIME type must be explicit:

```bash
supabase storage cp ./chapter.m4a ss:///bible-audio/bsb/v2026-03-26-1/chapters/JHN/3.m4a \
  --content-type "audio/mp4" \
  --cache-control "public, max-age=31536000, immutable"
```

### SQL Execution

Use the Supabase SQL editor or the project MCP SQL tool for control-plane pointer changes. The CLI in this repo is best used for migrations, not for ad hoc remote SQL execution.

## Rollback Levels

### Level 1: Manifest Pointer Rollback

Use when:

- chapter objects are healthy
- the new manifest is wrong
- the new audio version should not be current

Target state:

- previous audio version row becomes current
- bad version remains staged but non-current

Example SQL after `translation_audio_versions` exists:

```sql
begin;

update translation_audio_versions
set is_current = false
where translation_id = 'bsb'
  and is_current = true;

update translation_audio_versions
set is_current = true
where translation_id = 'bsb'
  and version_number = 3;

commit;
```

Then verify:

- the catalog still returns `has_audio = true`
- the current manifest URL now points to the previous version
- the app streams and downloads from the restored version

### Level 2: Translation Audio Kill Switch

Use when:

- no healthy audio version is currently safe to serve
- streaming must be disabled immediately

Example SQL:

```sql
update translation_catalog
set has_audio = false
where translation_id = 'bsb';
```

This is a blunt instrument. Use it only when pointer rollback cannot restore service quickly.

### Level 3: Client Rollback

Use when:

- backend bytes and manifests are healthy
- the new app resolver or downloader logic is broken

Actions:

1. revert the app change set
2. keep backend version pointers unchanged unless the bad app depends on a new backend field
3. ship the app rollback

The app must preserve the last known good installed local copy and prefer it over a failed candidate.

### Level 4: Storage Republish Rollback

Use when:

- the current object prefix itself is bad
- files were uploaded incomplete, corrupted, or with the wrong metadata

Actions:

1. upload the previous known-good audio pack to a new immutable versioned prefix
2. verify cache headers and range requests
3. point the current manifest or version row at the restored prefix

Do not overwrite bytes in place.

## Cache/Header Incident Procedure

If audio is slow because object headers were published incorrectly:

1. Do not try to “fix” the same live path in place.
2. Re-upload the pack to a new versioned prefix with the correct cache header.
3. Verify the new prefix with repeated `HEAD` requests and a byte-range request.
4. Flip the audio version pointer only after those checks pass.

Mandatory checks:

```bash
curl -I "https://.../audio/bsb/v2026-03-26-1/chapters/JHN/3.m4a"
curl -H "Range: bytes=0-1" -I "https://.../audio/bsb/v2026-03-26-1/chapters/JHN/3.m4a"
```

Expect:

- `Cache-Control: public, max-age=31536000, immutable`
- `Accept-Ranges: bytes`
- `206 Partial Content` for the range probe

## Post-Rollback Verification

After rollback:

1. Open the translation in the app while online.
2. Stream a known chapter.
3. Download one book.
4. Background the app and relaunch during download.
5. Reopen offline and confirm playback uses local files.
6. Confirm the previous good version, not the failed one, is active in the control plane.

## Release Gate for “Rollback Ready”

A new audio/text publish is not rollout-ready unless all of the following are true:

- previous version still exists
- manifest and object paths are versioned
- the app can keep the last known good install active
- rollback SQL or pointer steps are written down before publish
- storage health checks were captured for the new version

## First Implementation Sequence

To make rollback operational instead of theoretical:

1. Add the Supabase control-plane migration for audio versions.
2. Move audio publication to versioned prefixes.
3. Publish manifests and current-version rows.
4. Move the app to manifest-driven URLs.
5. Run one rollback drill on BSB before onboarding more translations.
