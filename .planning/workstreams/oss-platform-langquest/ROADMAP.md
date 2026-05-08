# Roadmap

## Phase 0: Architecture And License Baseline

Goal: Prove the OSS stack choices before implementation.

Build:

- OSS decision registry.
- License and deployment review for each recommended tool.
- ADRs for admin primitives, workflow runner, observability, LangQuest access, and media artifact contract.
- Translation ownership and chapter ingestion state machines.
- Initial Supabase schema sketch for LangQuest candidates, selected translations, chapter artifacts, runs, and audit events.

Success criteria:

- No dependency is adopted without clear license, deployment, rollback, and fit notes.
- Trigger.dev vs Graphile Worker decision is explicit.
- Admin canonical state vs optional Airtable/Baserow mirror is explicit.
- Phase 1 can start without open architecture ambiguity.

## Phase 1: Admin Foundation Upgrade

Goal: Make `apps/admin` easier to extend safely before adding the LangQuest workflow.

Build:

- Shared admin UI primitives using `shadcn/ui` patterns.
- Table abstraction over `TanStack Table` for admin list screens.
- Form abstraction using `React Hook Form` and `Zod`.
- Shared server action/API validation helpers.
- Pilot migration on one low-risk admin list/detail workflow.

Why first:

- LangQuest admin will need dense tables, filters, bulk actions, review forms, and stable validation.
- Reusing these primitives avoids another custom admin island.

Success criteria:

- One existing admin workflow uses the new primitives.
- Loading, empty, error, validation, and audit feedback states are consistent.
- No broad visual redesign or unrelated admin rewrite.

## Phase 2: Observability First

Goal: Add visibility before long-running ingestion jobs exist.

Build:

- GlitchTip/Sentry-compatible error capture for admin/server/job contexts.
- PostHog admin operational events and feature flags.
- Basic run/event model for job observability in Supabase.
- Admin health surface for workflow readiness and ingest feature flags.

Why before workflow:

- Ingestion failures need to be visible from day one.
- Feature flags let us ship later phases behind controlled rollout.

Success criteria:

- Admin/server exceptions are captured with environment and release context.
- Feature flags can gate LangQuest discovery and ingestion.
- Run events have stable ids that later workflow phases can attach to.

## Phase 3: Durable Workflow Plane

Goal: Stop building custom cron/retry infrastructure.

Build:

- Trigger.dev integration or Graphile Worker fallback.
- Job conventions for idempotency keys, retries, concurrency, cancellation, logging, and admin run links.
- Scheduled 24-hour job skeleton.
- Manual admin-triggered job entry point.
- Failure alerting and retry policy.

Success criteria:

- A no-op/pilot job can run on schedule and manually.
- Runs are visible in admin and observability tools.
- The system can safely retry without duplicate side effects.

## Phase 4: LangQuest Discovery Control Plane

Goal: Pull LangQuest translation candidates into admin without ingesting media yet.

Build:

- Scoped LangQuest read access via view/RPC or least-privilege service credential.
- Candidate refresh workflow for Bible projects and target languages.
- Supabase tables for source candidates and ownership decisions.
- Admin checklist for `needs_review`, `ours`, `not_ours`, `blocked`, `archived`.
- Audit trail for ownership changes.
- Optional Baserow/Airtable mirror only if operators need spreadsheet review.

Success criteria:

- Staff can see all eligible LangQuest Bible translation candidates.
- Staff can mark which translations are ours and select them for ingestion.
- Source refresh does not erase manual decisions.
- No media is copied to R2 yet.

## Phase 5: Chapter Artifact Ingestion

Goal: Copy selected LangQuest chapter assets into R2 as immutable, verifiable artifacts.

Build:

- Ordered segment fetcher following LangQuest rules.
- Audio key classifier that skips `local/` and `file://`.
- Canonical/alternate take handling.
- Manifest builder with schema version, source metadata, chapter metadata, segments, transcripts, durations, and R2 keys.
- R2 uploader for per-segment audio, manifest, transcript CSV, and `latest.json` pointer.
- Checksums and idempotency keyed by source translation/chapter/content metadata.
- Admin chapter artifact status screen.

Success criteria:

- Selected translations can ingest chapter artifacts into deterministic R2 paths.
- Re-running the job does not duplicate or corrupt artifacts.
- Missing/local-only audio produces actionable `not_ready` reasons.
- Operators can inspect failures and retry individual chapters.

## Phase 6: EveryBible Media Contract Integration

Goal: Make LangQuest artifacts usable by the app without bypassing existing media policy.

Build:

- Adapter from LangQuest manifest to EveryBible media catalog shape.
- Catalog/pointer update path that preserves rollback.
- Manifest validation before catalog publication.
- Optional merged audio pipeline only if product requires it.
- App/admin verification for selected pilot translation.

Success criteria:

- A pilot translation can be staged in the existing EveryBible media system.
- App consumption reads approved catalog pointers, not raw ingest scratch paths.
- Rollback works by pointer/catalog update.

## Phase 7: Publish Workflow And Admin Approval

Goal: Separate ingestion from publishing.

Build:

- Approval workflow: `ready` -> `approved` -> `published`.
- Role-gated admin actions for review, approval, publish, rollback, archive.
- Publish checklist and diff view for manifest/catalog changes.
- Optional Baserow/Airtable mirror update after admin source of truth is stable.

Success criteria:

- Ingested content is not automatically published.
- Publish decisions are auditable and reversible.
- Staff can understand what changed before publishing.

## Phase 8: Search, Support, And Operator UX

Goal: Improve operator efficiency after the core flow exists.

Build:

- Meilisearch index for translations, languages, chapters, ingest failures, and support/admin records.
- Admin global search and saved filters.
- Chatwoot integration only if support workflows require mature inbox tooling.
- Operational dashboards for coverage, readiness, failure reasons, stale source data, and publish queue.

Success criteria:

- Operators can quickly find the right translation/chapter/job/failure.
- Support tooling is adopted only if it removes real custom complexity.

## Phase 9: RBAC And Security Hardening

Goal: Tighten permissions once the workflow surface is known.

Build:

- Role matrix for view, ownership review, select-for-ingest, retry, approve, publish, rollback, archive.
- Supabase RLS/policy review for new tables.
- Secret handling and rotation playbook for LangQuest/R2/workflow tools.
- Casbin evaluation only if role logic is too complex for simple role tables/RLS.
- Security audit of external URL/object key handling.

Success criteria:

- Least-privilege access is documented and enforced.
- Sensitive job credentials never reach client code.
- Admin permissions match operational responsibilities.

## Phase 10: Decommission Old Paths

Goal: Remove or downgrade bespoke paths only after replacements are proven.

Build:

- Inventory of replaced scripts/admin flows.
- Migration notes for operators.
- Break-glass scripts kept only where useful and documented.
- Removal/deprecation PRs with tests and rollback notes.

Success criteria:

- No duplicate source of truth remains.
- Legacy scripts are either removed or clearly labeled as emergency/manual tools.
- Future contributors can tell which path is canonical.

## Recommended Phase Order

1. Phase 0 because architecture/license mistakes are expensive later.
2. Phase 1 because admin primitives lower the cost of every later operator screen.
3. Phase 2 because workflows without observability become invisible failure machines.
4. Phase 3 because durable jobs are the foundation for discovery and ingestion.
5. Phase 4 because ownership must be reviewed before copying media.
6. Phase 5 because R2 ingestion should happen only for selected owned translations.
7. Phase 6 because artifacts must join the existing media contract before app use.
8. Phase 7 because publishing requires approval separate from ingestion.
9. Phase 8 because search/support is most useful after real data and workflows exist.
10. Phase 9 because the final permission model is clearer after the workflow shape is real.
11. Phase 10 because decommissioning before replacement stability creates avoidable risk.
