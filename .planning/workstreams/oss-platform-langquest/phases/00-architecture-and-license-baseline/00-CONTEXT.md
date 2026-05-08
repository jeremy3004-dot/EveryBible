# Phase 0 Context

## Phase Goal

Decide and document the OSS platform architecture for admin, workflows, observability, and LangQuest ingestion before installing packages or changing production code.

## Why This Phase Exists

The LangQuest ingestion workflow crosses several risk boundaries:

- External database and storage access.
- Translation ownership/licensing decisions.
- Long-running scheduled jobs and retries.
- R2 media writes.
- Admin approval and publishing controls.

Building all of that from scratch would create operational risk in areas where mature OSS is available. Adopting OSS casually would create different risks: license surprises, schema drift, second admin surfaces, or systems that are hard to remove.

Phase 0 makes those decisions explicit.

## Existing EveryBible Context

- Admin dashboard already exists in `apps/admin`.
- Supabase already acts as the backend/control plane.
- R2 is already used for Bible media artifacts.
- Existing media policy prefers immutable versioned media paths and rollback by pointer.
- Existing scripts already publish/generate some R2 Bible assets.
- Current repo has active unrelated work in Bible translation picker files; this workstream must not touch those files.

## LangQuest Context

LangQuest Bible chapters are `quest` rows under `project.template = 'bible'`.

Relevant source rules:

- Chapter identity lives in `quest.metadata.bible.book` and `quest.metadata.bible.chapter`.
- Target language comes from `project_language_link.language_type = 'target'`.
- Chapter segments come from `quest_asset_link -> asset -> asset_content_link`.
- Playback order is `asset.order_index`, `asset.created_at`, `asset_content_link.order_index`, `asset_content_link.created_at`.
- Exclude translated/derived assets with `asset.source_asset_id is null`.
- Skip local-only audio keys beginning with `local/` or `file://`.
- The first resolvable take is canonical; later takes are alternates.
- Millisecond verse timings are not stored by LangQuest and must be computed during ingestion if needed.

## Phase 0 Inputs

- This workstream's `PROJECT.md`, `REQUIREMENTS.md`, and `OSS-SCOUT.md`.
- Existing EveryBible admin/backend/R2 code and docs.
- LangQuest export notes supplied by Peter.
- Official OSS license/deployment/security documentation for candidate tools.

## Phase 0 Outputs

- OSS decision registry.
- ADRs for admin primitives, workflow plane, observability, LangQuest access, and media contract integration.
- Supabase schema sketches for candidates, ownership decisions, chapter artifacts, workflow runs, and audit events.
- State machine diagrams for ownership, ingestion, and publishing.
- Phase 1 readiness checklist.

## Explicit Non-Goals

- Do not install packages.
- Do not create migrations.
- Do not modify admin UI.
- Do not create workflow jobs.
- Do not request production credentials.
- Do not ingest LangQuest media.
