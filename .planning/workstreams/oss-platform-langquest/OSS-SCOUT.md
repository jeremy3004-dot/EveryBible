# OSS Scout Findings

## Decision Principles

- Use OSS for commodity infrastructure: tables, forms, validation, durable jobs, observability, analytics, search, support, and policy enforcement.
- Keep EveryBible-specific logic custom: translation ownership, Bible media contract, LangQuest ingest mapping, app publishing semantics, and reader UX.
- Prefer OSS that can run incrementally beside the current architecture.
- Avoid OSS that forces a second canonical schema, a second admin app, or opaque workflow state.

## Recommended Adoption

| Capability | Recommended OSS | License posture | Adoption | Rationale |
| --- | --- | --- | --- | --- |
| Admin component primitives | `shadcn/ui` | MIT | Phase 1 | Copy-owned primitives fit Next admin, avoid heavy design-system dependency, improve consistency. |
| Admin tables | `@tanstack/react-table` | MIT | Phase 1 | Mature headless table logic for filters, sorting, selection, pagination, column visibility. |
| Admin forms | `react-hook-form` | MIT | Phase 1 | Mature form state library with low render overhead and good schema resolver ecosystem. |
| Validation/contracts | `zod` | MIT | Phase 1 | Shared runtime validation for admin forms, ingestion manifests, API boundaries. |
| Workflow/cron/retries | `Trigger.dev` | Apache-2.0 | Phase 3 | Durable jobs, schedules, retries, run visibility, good TS ergonomics. |
| Workflow fallback | `graphile-worker` | MIT | Phase 3 fallback | Postgres-native queue if Trigger.dev deployment or operating model does not fit. |
| Error tracking | `GlitchTip` | MIT | Phase 2 | Sentry-compatible OSS error tracking with self-host option. |
| Analytics/flags | `PostHog` | MIT core/open-core | Phase 2 | Product/admin analytics plus feature flags without building bespoke event tooling. |
| Admin/content search | `Meilisearch` CE | MIT | Phase 8 | Fast typo-tolerant operational search over translations, languages, chapters, failures. |
| Support operations | `Chatwoot` | MIT | Phase 8 optional | Mature support/inbox workflows if custom support admin grows. |
| Spreadsheet-style mirror | `Baserow` | MIT core/open-core | Phase 7 optional | Airtable-like operator surface without making spreadsheets canonical. |
| Editorial CMS | `Payload CMS` | MIT | Future | Strong TS CMS if editorial/publishing workflows outgrow current admin. |
| Authorization policy | `Casbin` | Apache-2.0 | Phase 9 conditional | Useful only when role/permission matrix becomes too complex for simple role tables/RLS. |
| R2 client | `@aws-sdk/client-s3` | Apache-2.0 | Existing/Phase 5 | Already aligns with R2 S3-compatible upload path. |
| Audio metadata | `music-metadata` | MIT | Phase 5 | Duration/content metadata for segments without requiring full transcoding. |
| Audio merge/transcode | FFmpeg | LGPL/GPL build-dependent | Phase 6 optional | Required only for merged chapter audio/transcoding; license/build must be pinned. |

## Do Not Adopt As Core Control Plane

| Tool | Why not core |
| --- | --- |
| Directus | Good generic data admin, but would compete with Supabase/admin ownership and invite schema drift. |
| NocoDB | Useful spreadsheet UI, but not durable enough as canonical ownership/publishing control plane. |
| ToolJet | Splits operator workflows away from `apps/admin` and duplicates auth/permissions concerns. |
| n8n | Strong automation, but less ideal for core ingestion provenance, typed TS code, and product-coupled retries. |
| Airtable | Fine as a mirror or handoff surface, but not canonical for ownership, ingestion, or publishing state. |

## LangQuest-Specific Build Vs Buy

Build custom:

- LangQuest schema mapping and source query rules.
- Translation ownership state machine.
- EveryBible manifest shape and R2 key layout.
- Admin approval/publish/rollback semantics.
- Checksums, idempotency keys, and media contract validation.

Use OSS:

- Workflow execution and scheduling.
- Admin tables/forms/validation.
- Error tracking, run telemetry, analytics, and flags.
- Search indexing for operational discovery.
- Audio duration parsing and optional FFmpeg merge/transcode.

## Validation Needed In Phase 0

- Confirm current licenses directly from official package repositories/docs before dependency adoption.
- Decide self-hosted vs managed Trigger.dev/PostHog/GlitchTip posture.
- Confirm whether Cloudflare Workers constraints matter for any workflow/audio dependency.
- Confirm LangQuest access model: scoped views/RPCs preferred over broad service-role key.
- Confirm whether merged audio is a product requirement or a later convenience.
- Confirm whether Baserow/Airtable mirror is actually needed after admin checklist exists.
