# Phase 0 Plan: Architecture And License Baseline

## Objective

Create the decision foundation for a long-lived OSS-backed admin/workflow/ingestion platform.

## Tasks

### 1. Confirm Existing Architecture And Constraints

- Read current admin, Supabase, R2, and media-policy docs.
- Identify existing R2 manifest/catalog conventions.
- Identify existing admin audit/logging conventions.
- Identify any existing cron/job patterns.
- Confirm which files/paths are off-limits due to active unrelated work.

Deliverable:

- `ARCHITECTURE-NOTES.md` with current-state summary and integration constraints.

### 2. Create OSS Decision Registry

For each candidate tool, record:

- Capability.
- Package/project name.
- Official source URL.
- License.
- Hosted/self-host deployment options.
- Data residency/security considerations.
- API/TypeScript quality.
- Integration fit with `apps/admin`, Supabase, R2, Cloudflare, and existing scripts.
- Operational cost.
- Rollback/removal path.
- Decision: adopt, adopt later, spike, reject, or fallback.

Candidate tools:

- `shadcn/ui`
- `@tanstack/react-table`
- `react-hook-form`
- `zod`
- `Trigger.dev`
- `graphile-worker`
- `GlitchTip`
- `PostHog`
- `Meilisearch`
- `Chatwoot`
- `Baserow`
- `Payload CMS`
- `Casbin`
- `@aws-sdk/client-s3`
- `music-metadata`
- FFmpeg

Deliverable:

- `OSS-DECISIONS.md`.

### 3. Decide Workflow Plane

Evaluate:

- Trigger.dev managed vs self-hosted.
- Graphile Worker fallback.
- Runtime constraints for jobs that download audio, compute metadata, and upload to R2.
- Run visibility and admin linking.
- Retry/idempotency support.
- Secret handling.
- Local development ergonomics.

Decision criteria:

- Durable scheduled jobs.
- Manual reruns from admin.
- Clear per-run observability.
- TypeScript-first implementation.
- Bounded concurrency and retry control.
- No avoidable second source of truth.

Deliverable:

- `ADR-001-workflow-plane.md`.

### 4. Decide Observability Stack

Evaluate:

- GlitchTip/Sentry-compatible error capture.
- PostHog analytics and feature flags.
- What data is safe to attach to events.
- Release/environment tagging.
- How workflow run ids flow through logs/errors/events.

Deliverable:

- `ADR-002-observability.md`.

### 5. Decide Admin Primitive Strategy

Evaluate:

- How `shadcn/ui` components should live in `apps/admin`.
- How TanStack Table, React Hook Form, and Zod fit existing admin pages.
- Shared validation and server action patterns.
- Pilot admin page for Phase 1.

Deliverable:

- `ADR-003-admin-primitives.md`.

### 6. Decide LangQuest Access Model

Evaluate:

- Preferred scoped Postgres views/RPCs.
- Minimum fields needed for discovery and ordered segment queries.
- Whether a service-role key is unavoidable.
- Storage access mode: public object URLs vs signed URLs.
- Secret storage and rotation.
- Source identity stability for candidates.

Deliverable:

- `ADR-004-langquest-access.md`.

### 7. Define Domain Schemas And State Machines

Sketch Supabase tables or equivalent entities:

- `langquest_translation_candidate`
- `langquest_translation_ownership_decision`
- `langquest_selected_translation`
- `langquest_chapter_artifact`
- `langquest_ingest_run`
- `langquest_ingest_event`
- `admin_audit_log` extension or integration with existing audit logs

Define states:

- Ownership: `needs_review`, `ours`, `not_ours`, `blocked`, `archived`.
- Selection: `not_selected`, `selected`, `paused`.
- Chapter ingest: `not_ready`, `pending`, `processing`, `ready`, `failed`, `superseded`.
- Publish: `candidate`, `ready`, `approved`, `published`, `archived`, `rolled_back`.

Deliverables:

- `SCHEMA-SKETCH.md`.
- `STATE-MACHINES.md`.

### 8. Define Media Manifest Contract

Specify:

- R2 key layout.
- Manifest schema version.
- Segment schema.
- Canonical/alternate take representation.
- Duration/timing source.
- Transcript CSV policy.
- `latest.json` pointer behavior.
- How LangQuest artifacts join the existing EveryBible catalog.

Deliverable:

- `MEDIA-CONTRACT.md`.

### 9. Produce Phase 1 Plan

Choose the first implementation slice:

- Which admin page pilots shared primitives.
- Which packages are adopted first.
- Which tests and verification gates apply.
- How rollback works if the migration causes friction.

Deliverable:

- `../01-admin-foundation-upgrade/01-PLAN.md` or equivalent Phase 1 planning file.

## Verification

- All Phase 0 deliverables exist.
- OSS decisions include license, deployment, fit, and rollback notes.
- ADRs make explicit adopt/reject/fallback decisions.
- Schema/state docs satisfy all Phase 0-relevant requirements.
- No implementation files are changed.
- `git diff -- .planning/workstreams/oss-platform-langquest` shows only planning artifacts.

## Risks

- Trigger.dev fit may be weaker if self-hosting/secret/runtime constraints conflict with current deployment.
- FFmpeg licensing and deployment can become a distraction if merged audio is pulled into MVP.
- Broad LangQuest service-role access would create avoidable security risk.
- Baserow/Airtable mirror can confuse operators if canonical ownership is not visually obvious.

## Recommended Decisions To Bias Toward

- Start with per-segment audio, not merged audio.
- Make Supabase/admin canonical; mirror out only after the core workflow is stable.
- Use Trigger.dev unless Phase 0 finds a concrete blocker.
- Keep Graphile Worker as the fallback, not a parallel runtime.
- Add observability before real ingestion.
- Make publishing a separate approval step after ingestion.
