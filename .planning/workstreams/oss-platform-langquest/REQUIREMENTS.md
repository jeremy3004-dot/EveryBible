# Requirements

## OSS Governance

- OSS-01: Maintain an OSS decision registry with package, license, deployment model, security posture, fit rationale, owner, and adoption phase.
- OSS-02: Prefer permissive OSS licenses for core runtime dependencies.
- OSS-03: Require explicit approval notes before adopting GPL, AGPL, SSPL, Commons Clause, source-available, or custom-licensed tools.
- OSS-04: Each adopted OSS tool must have a rollback or removal path documented before production use.
- OSS-05: Commodity infrastructure should be reused when healthy OSS exists; custom code should be reserved for EveryBible domain logic, product UX, security boundaries, and weak OSS fit.

## Admin Foundation

- ADMIN-01: Admin list/detail workflows must use reusable table, filter, pagination, form, validation, and empty/error state primitives.
- ADMIN-02: Complex admin tables must support sorting, filtering, column visibility, row selection, bulk action affordances, and stable loading states.
- ADMIN-03: Forms that change publishing, ownership, or ingestion state must use schema validation and explicit server-side validation.
- ADMIN-04: Admin workflows must leave audit trails for state changes and batch actions.
- ADMIN-05: Admin UI should remain inside `apps/admin`; external OSS admin tools may supplement but not replace the primary dashboard without an ADR.

## Observability

- OBS-01: Backend/admin exceptions must be reported to an error tracking system with environment, release, request/job id, and user/admin context where safe.
- OBS-02: Workflow runs must expose status, duration, retry count, failure reason, and related translation/chapter ids.
- OBS-03: Admin feature usage and operational funnel events must be visible without hand-rolled analytics tables for every screen.
- OBS-04: Feature flags must gate risky rollout of ingestion, publishing, search, and workflow changes.

## Workflow Plane

- WORKFLOW-01: Scheduled, manual, and retryable backend jobs must run through a durable workflow system.
- WORKFLOW-02: The LangQuest selected-translation pull must run every 24 hours and support manual re-run from admin.
- WORKFLOW-03: Jobs must be idempotent by stable keys, checksums, and artifact manifests.
- WORKFLOW-04: Job failures must be visible in admin and must not silently skip translations or chapters.
- WORKFLOW-05: Long-running ingestion must support bounded concurrency, backoff, cancellation/superseding, and partial retry.

## LangQuest Discovery And Ownership

- LQ-01: Every eligible LangQuest Bible project/translation candidate must be discoverable through scoped access.
- LQ-02: Candidates must expose project id, project name, template, privacy/published signal, target language, book/chapter coverage, source updated timestamps, and ingestion readiness.
- LQ-03: Admins must classify each translation candidate as `needs_review`, `ours`, `not_ours`, `blocked`, or `archived`.
- LQ-04: Only `ours` candidates may be selected for R2 ingestion.
- LQ-05: Each ownership decision must record reviewer, timestamp, reason/notes, and source evidence where available.
- LQ-06: Candidate refresh must not overwrite manual ownership decisions unless the source identity changes enough to require re-review.

## Chapter Artifact Ingestion

- INGEST-01: For selected translations, fetch chapter segments using LangQuest ordering rules: asset order, asset created time, content link order, content link created time.
- INGEST-02: Exclude translation-derived assets by requiring `asset.source_asset_id is null`.
- INGEST-03: Skip local-only audio keys beginning with `local/` or `file://`.
- INGEST-04: Preserve canonical take policy: first resolvable audio take is canonical; alternates may be stored and flagged.
- INGEST-05: Compute a deterministic checksum over included source asset ids and relevant audio/text metadata.
- INGEST-06: If a chapter has no resolvable audio, mark it `not_ready` with a useful reason.
- INGEST-07: Write `manifest.json` and ordered per-segment audio files to deterministic R2 keys.
- INGEST-08: Merged chapter audio is optional and should only be added after per-segment ingestion is healthy.
- INGEST-09: Duration/timing data must be computed by ingest tooling; do not imply LangQuest provides millisecond verse alignment.
- INGEST-10: R2 writes must be immutable for content-addressed paths; `latest.json` or catalog pointers may change.

## Media Contract And Publishing

- MEDIA-01: LangQuest artifacts must integrate with the existing EveryBible R2 media contract instead of creating a separate media universe.
- MEDIA-02: Published app consumption must read approved manifests/catalog pointers, not raw ingest scratch data.
- MEDIA-03: Publishing transitions must be explicit: `candidate` -> `ready` -> `approved` -> `published` -> `archived`.
- MEDIA-04: Rollback must be possible by pointer/catalog update without deleting content-addressed artifacts.
- MEDIA-05: Manifest schema versions must be validated before app consumption.

## Search, Support, And Operator UX

- OPS-01: Operators need fast search over translations, projects, languages, chapters, ownership state, ingest state, and failure reasons.
- OPS-02: Support/admin queues should reuse a mature support tool if custom support workflows become broad or multi-agent.
- OPS-03: Spreadsheet-style review is allowed as a mirror/export, but admin/Supabase remains canonical.

## Security And Access

- SEC-01: LangQuest data access must be least-privilege: scoped views/RPCs or narrowly scoped service credentials.
- SEC-02: R2 credentials must only be available to server-side jobs and upload endpoints.
- SEC-03: Admin permissions must separate view, ownership review, ingestion control, approval, publish, and rollback.
- SEC-04: Audit logs must capture before/after state for ownership, ingest selection, approval, publish, and rollback.
- SEC-05: Storage object keys and external URLs must be validated and sanitized before download or upload.

## Decommissioning

- DEBT-01: Existing bespoke scripts and one-off admin paths must be cataloged before replacements.
- DEBT-02: A path is decommissioned only after the OSS-backed path is observable, documented, and verified in production.
- DEBT-03: Keep emergency/manual repair scripts where they reduce operational risk, but document them as break-glass paths.

## Out Of Scope

- Replacing Supabase as the canonical database.
- Replacing R2 as the Bible media store.
- Making Airtable, Baserow, Directus, or NocoDB canonical.
- Publishing translations without ownership/license review.
- Building a general-purpose LangQuest clone.
- Building waveform-aligned verse timing unless separately specified.
