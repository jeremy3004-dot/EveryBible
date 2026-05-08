# OSS Platform Hardening And LangQuest Ingestion Control Plane

## Purpose

Build EveryBible's backend/admin foundation around durable, well-maintained open source primitives instead of bespoke internal tooling where the problem is commodity infrastructure.

This workstream has two linked goals:

1. Systematically adopt OSS for admin UI, workflows, observability, search, support, and operational controls where it improves long-term health.
2. Add a LangQuest ingestion control plane so staff can review Bible translation candidates, decide which translations are ours, and pull selected chapter artifacts into R2 every 24 hours with idempotent, auditable workflows.

## Product Shape

EveryBible remains the source product experience. Supabase remains the control plane. R2 remains the media plane. The admin dashboard becomes the operational command center for translation ownership, ingestion status, publishing approval, health checks, and rollback.

OSS is used as infrastructure and admin leverage, not as a replacement for the user-facing Bible reading experience or EveryBible's domain model.

## Non-Negotiables

- Long-term maintainability beats short-term demos.
- Do not make Airtable or any external spreadsheet the canonical source of truth.
- Do not ingest or publish translations unless ownership/license state is explicit.
- Do not build custom workflow/retry/cron infrastructure when a healthy OSS workflow system fits.
- Do not mutate published media in place; use immutable R2 objects and pointer/manifest updates.
- Do not expose broad LangQuest service-role access if scoped views/RPCs can satisfy the integration.
- Prefer permissive licenses: MIT, Apache-2.0, BSD-style. Treat GPL, AGPL, SSPL, Commons Clause, custom, and source-available terms as explicit review items.

## Primary Systems

- `apps/admin`: Next.js admin dashboard and operational UI.
- Supabase: canonical metadata, admin state, audit logs, translation catalog, user/project records.
- Cloudflare R2: immutable Bible text/audio/media artifacts.
- Existing Bible media policy: R2 media plane with versioned manifests and rollback by pointer.
- LangQuest Supabase: external source for eligible Bible projects, quests, assets, content links, and storage attachments.

## Target OSS Stack

Adopt these systematically unless Phase 0 finds a blocking fit, license, or deployment issue:

- Admin UI primitives: `shadcn/ui`, `TanStack Table`, `React Hook Form`, `Zod`.
- Workflow plane: `Trigger.dev` as primary; `Graphile Worker` as fallback if self-host constraints require a Postgres-native worker.
- Observability: `GlitchTip` for error tracking; `PostHog` for admin analytics and feature flags.
- Search: `Meilisearch` community edition for admin/content search when relational filters become too slow or clumsy.
- Support/admin operations: `Chatwoot` for support surfaces if the current custom support queue grows beyond admin-only triage.
- Optional spreadsheet-style mirror: `Baserow` only as an operator mirror/export destination, not canonical state.
- Future editorial/CMS layer: `Payload CMS` only if content workflow becomes broad enough to justify a CMS.
- Authorization policy engine: `Casbin` only when role/permission logic outgrows Supabase RLS plus simple role tables.
- R2 and audio tooling: `@aws-sdk/client-s3`, `music-metadata`, and FFmpeg only for merged audio or transcoding needs.

## Explicitly Avoid For Core

- Directus: useful admin/data platform, but too much overlap and schema ownership pressure for this app's existing Supabase-first architecture.
- NocoDB: helpful spreadsheet UI, but not the right canonical admin backend.
- ToolJet: good internal app builder, but would split admin UX and permissions away from `apps/admin`.
- n8n: powerful automation, but workflow provenance, deployment, and license/operational fit are weaker for core ingestion than Trigger.dev/Graphile Worker.

## Done For This Workstream

- OSS adoption policy and license registry exist.
- Admin dashboard uses shared OSS primitives for complex tables/forms instead of custom one-off versions.
- Durable workflow runner handles LangQuest discovery, candidate refresh, selected translation ingestion, R2 uploads, retries, and audit events.
- Translation ownership and ingestion decisions are visible and reviewable in admin.
- Selected translations are pulled from LangQuest into R2 on a 24-hour schedule.
- R2 artifacts follow immutable media contract and can be rolled back by pointer.
- Observability tells operators what failed, what retried, what changed, and what is blocked.
- Legacy/manual scripts are retained only where still useful and are documented as secondary paths.
