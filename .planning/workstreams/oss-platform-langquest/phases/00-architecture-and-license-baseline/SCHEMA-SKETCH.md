# Schema Sketch

## Tables

- `workflow_runs`: generic durable run ledger for scheduled/manual workflow tasks.
- `workflow_events`: timestamped events linked to `workflow_runs`.
- `langquest_translation_candidates`: discovered LangQuest Bible project/language candidates.
- `langquest_ownership_decisions`: immutable-ish decision history for ownership/licensing review.
- `langquest_selected_translations`: translations approved for recurring ingestion.
- `langquest_chapter_artifacts`: per-chapter ingest artifacts and status.

## Ownership States

- `needs_review`
- `ours`
- `not_ours`
- `blocked`
- `archived`

## Selection States

- `not_selected`
- `selected`
- `paused`

## Chapter Artifact States

- `not_ready`
- `pending`
- `processing`
- `ready`
- `failed`
- `superseded`

## Publish States

- `candidate`
- `ready`
- `approved`
- `published`
- `archived`
- `rolled_back`

## Access Model

Enable RLS on all new tables. Do not add anon/auth policies for workflow/control-plane tables initially. Admin and workflows access them through service-role server paths after explicit admin/workflow authorization.
