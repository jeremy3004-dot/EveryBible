# Appsmith Internal-Ops POC Runbook

## Scope

This POC evaluates Appsmith as a low-code internal-ops companion for EveryBible. It must not become a new runtime dependency for the mobile app, `apps/admin`, Supabase functions, or the R2 media delivery path.

Use Appsmith for read-heavy operational views, narrow triage workflows, and quick visibility over existing Supabase/admin contracts. Keep source-of-truth writes in the existing reviewed surfaces unless a later phase adds explicit server-side admin endpoints with audit logging.

## What Appsmith Should Replace

Appsmith can replace:

- One-off Supabase SQL snippets used by operators to answer common status questions.
- Manual spreadsheet-style review dashboards for catalog readiness, media manifest health, and chapter feedback export state.
- Ad hoc read-only support queries that currently require an engineer to run SQL.
- Early POC-only operator screens that are not worth hardening in the Next.js admin shell yet.

Appsmith should not replace:

- The mobile app's catalog, media, auth, or feedback runtime.
- The Next.js admin shell in `apps/admin` for owned product workflows such as translation metadata edits, upstream sync actions, support detail pages, analytics, content operations, and audit-led admin workflows.
- Supabase migrations, Edge Functions, RLS policies, or service-role boundary design.
- Cloudflare R2 publishing, `https://everybible.app/api/media/...`, or the server-side media proxy.
- Google Sheets as the current chapter-feedback operator sink until the feedback workflow is intentionally redesigned.
- Git-reviewed changes to source, schemas, migrations, release policy, or media publishing scripts.

## Repo Evidence

- `apps/admin/lib/admin-data.ts` already uses `createAdminServiceClient()` server-side to read `translation_catalog`, `translation_versions`, `translation_sync_runs`, support tables, and `chapter_feedback_submissions` counts.
- `apps/admin/lib/supabase/service.ts` keeps `SUPABASE_SERVICE_ROLE_KEY` on the server with `persistSession: false`.
- `apps/admin/app/(dashboard)/translations/*` owns translation distribution metadata and upstream sync visibility.
- `apps/admin/app/(dashboard)/health/page.tsx` owns first-party readiness checks for stale syncs, missing content, and mismatched delivery state.
- `supabase/migrations/20260322140700_create_content_versioning.sql` defines `translation_catalog` and `translation_versions`; later migrations add public read policies for anon/authenticated catalog access.
- `docs/bible-media-platform-policy.md` defines Supabase as the media control plane and R2/CDN as the media plane. Clients must use catalog/manifest metadata, not infer paths.
- `docs/chapter-feedback-ops.md` defines `public.chapter_feedback_submissions` as the durable record and Google Sheets as an operator review sink.
- `supabase/functions/submit-chapter-feedback/index.ts` validates the user bearer token with the anon key, then uses the service-role key only inside the Edge Function to save feedback and update export status.

## POC Deployment Shape

Recommended setup:

1. Run Appsmith as a separate internal tool, not inside this monorepo.
2. Configure a staging Supabase project first. Production access requires approval from the full-stack owner.
3. Prefer HTTPS-only access behind SSO/VPN or the team's existing internal access control.
4. Name the app `EveryBible Internal Ops POC`.
5. Mark every first-pass datasource as read-only unless it calls an approved server-side endpoint.

Do not:

- Add Appsmith packages to this repo.
- Commit Appsmith exports containing secrets.
- Put service-role keys, R2 keys, Google service account keys, or upstream API keys in client-side JavaScript, visible query bodies, page widgets, or Appsmith public app settings.

## API And Data Access Pattern

### Preferred Pattern

Use one of these patterns, in priority order:

1. Server-side admin endpoints in `apps/admin` that authenticate the operator, perform authorization, use the service-role key only on the server, write audit logs, and return a narrow JSON payload.
2. Supabase read-only SQL views or SECURITY DEFINER RPCs that expose only the columns Appsmith needs.
3. Direct Supabase PostgREST reads with the publishable/anon key only for tables already intended to be public-read, such as catalog/version metadata.

For the POC, avoid mutations except comments/status fields that already have a safe server-side endpoint. If a mutation is needed, add a tiny reviewed endpoint later rather than granting Appsmith broad table writes.

### Implemented POC Endpoints

The repo now exposes three read-only admin API endpoints for Appsmith:

- `GET /api/ops/appsmith/translations`
- `GET /api/ops/appsmith/media-health`
- `GET /api/ops/appsmith/feedback?limit=200`

Authentication:

- Set `APPSMITH_OPS_API_KEY` in the admin deployment environment.
- Send the key as `Authorization: Bearer <key>` or `x-api-key: <key>`.
- If `APPSMITH_OPS_API_KEY` is missing, endpoints return `503` with `reason: "missing_key"`.
- If the presented key is wrong or absent, endpoints return `401`.

The implementation uses the existing server-side Supabase service client inside `apps/admin`; Appsmith receives only reduced JSON responses. The endpoints do not return the Supabase service-role key, raw catalog JSON, translation admin notes, sync-run message bodies, full feedback comments, user IDs, or concrete media delivery URLs/hashes.

### Service-Role Boundary

Never place `SUPABASE_SERVICE_ROLE_KEY` in Appsmith client code. The existing repo pattern is explicit: `apps/admin/lib/supabase/service.ts` uses the key only in a server-side helper, and `submit-chapter-feedback` uses it only inside a Supabase Edge Function after authenticating the caller.

If Appsmith needs privileged data:

- Appsmith calls an internal server endpoint.
- The endpoint checks the operator identity and role.
- The endpoint queries Supabase with the service-role key server-side.
- The endpoint returns a filtered payload.
- The endpoint logs any mutation in `admin_audit_logs`.

### Read-Only SQL View/RPC Candidates

These can be added later if the POC graduates beyond manual Appsmith wiring:

- `ops_translation_catalog_status`: selected fields from `translation_catalog`, current row from `translation_versions`, and recent sync timestamp.
- `ops_media_manifest_health`: selected catalog JSON fields, `has_audio`, `has_text`, `is_available`, inferred missing text/audio manifest flags, and last updated timestamp.
- `ops_chapter_feedback_triage`: selected non-sensitive columns from `chapter_feedback_submissions`, grouped counts by export status/language/chapter, and recent failed exports.

Keep personally identifiable fields out of default views. For chapter feedback, prefer participant name/role only where needed for reviewer workflow; do not expose emails, push tokens, or unrelated user profile data.

## POC View 1: Translation Catalog Status

Purpose: give operators a fast answer to "which translations are publishable, stale, hidden, or missing current versions?"

Evidence-backed source tables:

- `translation_catalog`
- `translation_versions`
- `translation_sync_runs`

Suggested widgets:

- Summary cards: total translations, published translations, hidden published translations, translations missing current version, failed sync runs.
- Filterable table by `language_name`, `distribution_state`, `is_available`, `has_text`, `has_audio`.
- Detail panel showing `translation_id`, `name`, `abbreviation`, `upstream_last_synced_at`, current version, total books/chapters/verses, and whether a recent sync message exists.

Suggested read query shape:

```sql
select
  catalog.translation_id,
  catalog.name,
  catalog.abbreviation,
  catalog.language_name,
  catalog.has_text,
  catalog.has_audio,
  catalog.is_available,
  catalog.distribution_state,
  catalog.updated_at,
  catalog.upstream_last_synced_at,
  version.version_number as current_version,
  version.total_books,
  version.total_chapters,
  version.total_verses
from public.translation_catalog catalog
left join public.translation_versions version
  on version.translation_id = catalog.translation_id
 and version.is_current = true
order by catalog.language_name asc, catalog.name asc;
```

Operator actions for POC:

- Read and filter only through `GET /api/ops/appsmith/translations`.
- Deep-link to `/translations` or `/translations/{translationId}` in `apps/admin` for edits and upstream sync operations.

Do not let Appsmith update `distribution_state`, `is_available`, or `admin_notes` in the POC. Those edits already exist in the admin shell and should keep its auth/audit path. If operators need to view or edit admin notes, deep-link to the admin shell instead of adding notes to the Appsmith ops payload.

## POC View 2: Media Manifest Health

Purpose: surface catalog/media contract problems before mobile clients hit them.

Evidence-backed source:

- `translation_catalog.catalog` JSON metadata.
- Media policy in `docs/bible-media-platform-policy.md`.
- Existing admin health checks in `apps/admin/app/(dashboard)/health/page.tsx`.

Suggested widgets:

- Summary cards: text-enabled translations missing text download URL, audio-enabled translations missing audio metadata, available translations with no text, audio-capable translations not available.
- Table showing text/audio/timing health booleans extracted from `catalog`, not raw catalog JSON or concrete delivery URLs.
- "Policy violations" panel for rows that break the media policy.

Suggested read query shape:

```sql
select
  translation_id,
  name,
  language_name,
  has_text,
  has_audio,
  is_available,
  distribution_state,
  catalog->>'version' as catalog_version,
  (catalog #>> '{text,downloadUrl}') is not null as has_text_download_url,
  (catalog #>> '{text,sha256}') is not null as has_text_sha256,
  catalog #>> '{audio,strategy}' as audio_strategy,
  (
    (catalog #>> '{audio,downloadUrl}') is not null
    or (catalog #>> '{audio,provider}') is not null
    or (catalog #>> '{audio,baseUrl}') is not null
  ) as has_audio_delivery_reference,
  (catalog #>> '{audio,fileExtension}') is not null as has_audio_file_extension,
  (catalog #>> '{audio,mimeType}') is not null as has_audio_mime_type,
  updated_at
from public.translation_catalog
order by language_name asc, name asc;
```

Health rules to encode in Appsmith:

- `has_text = true` should have `catalog.text.downloadUrl` and preferably `catalog.text.sha256`.
- `has_audio = true` should have `catalog.audio.strategy`, `catalog.audio.baseUrl`, `catalog.audio.chapterPathTemplate`, `catalog.audio.fileExtension`, and `catalog.audio.mimeType`.
- `is_available = true` with `has_text = true` should not be missing the text pack path.
- Audio metadata should be treated as a manifest/control-plane contract. Do not hardcode R2, Supabase Storage, or file extension assumptions in Appsmith logic.

Operator actions for POC:

- Read-only health review through `GET /api/ops/appsmith/media-health`.
- Link to `docs/bible-media-platform-policy.md` and the admin `/health` page.
- Escalate fixes to the normal media publishing/review path.

## POC View 3: Chapter Feedback Triage

Purpose: make saved feedback and Sheets export failures easy to review without replacing the durable Supabase record.

Evidence-backed source:

- `public.chapter_feedback_submissions`
- `docs/chapter-feedback-ops.md`
- `supabase/functions/submit-chapter-feedback/index.ts`

Suggested widgets:

- Summary cards: pending, exported, failed, last 24 hours, thumbs down count.
- Filters: `export_status`, `translation_language`, `translation_id`, `book_id`, `sentiment`, date range.
- Triage table with submission ID, created time, translation/language, book/chapter, sentiment, comment preview, participant name/role, platform/version, export status, and export error.
- Failed exports panel using the same ordering as the manual retry workflow: oldest failed first.

Suggested read query shape:

```sql
select
  id,
  created_at,
  translation_language,
  translation_id,
  book_id,
  chapter,
  sentiment,
  comment,
  participant_name,
  participant_role,
  interface_language,
  content_language_code,
  content_language_name,
  source_screen,
  app_platform,
  app_version,
  export_status,
  exported_at,
  export_error
from public.chapter_feedback_submissions
order by created_at desc
limit 500;
```

Operator actions for POC:

- Read and filter through `GET /api/ops/appsmith/feedback?limit=200`.
- For failed exports, follow `docs/chapter-feedback-ops.md`: append manually to the correct Google Sheets tab, verify the row, then mark exported in Supabase.

Do not expose `user_id` by default. It is needed for the existing Sheets header and durable record, but Appsmith triage can usually operate on submission ID plus participant fields. If user-level support is needed, deep-link to the existing support page in `apps/admin`.

## Rollback And Removal

The POC must be removable without impacting the mobile app or `apps/admin`.

Rollback steps:

1. Disable Appsmith app access or unpublish the Appsmith application.
2. Rotate any Appsmith-held datasource credentials. If only anon/read-only keys were used, rotation is lower urgency but still recommended after a production POC.
3. Remove Appsmith IP allowlist entries, SSO assignments, or VPN access rules created for the POC.
4. Drop any POC-only SQL views/RPCs with a reviewed migration if they were added later. Do not drop base tables or existing admin functions.
5. Delete POC-only Appsmith exports from internal storage. Confirm no export contains service-role, R2, Google, or upstream API secrets.
6. Verify mobile catalog load, media playback/download, admin `/translations`, admin `/health`, and chapter feedback submission still work through their existing paths.

Because Appsmith is external and read-only for this POC, rollback should not require app releases, Supabase function redeploys, or admin shell changes.

## Acceptance Checklist

- Appsmith is not added to package manifests, app code, Supabase functions, or mobile runtime dependencies.
- No secrets are committed or embedded in Appsmith-visible client code.
- Service-role access, if needed, is only behind a server-side endpoint or Edge Function that authenticates operators.
- Translation catalog status view lists catalog rows, current version state, availability, text/audio flags, and freshness.
- Media manifest health view flags missing text/audio metadata using catalog-driven rules from the media policy.
- Chapter feedback triage view shows pending/exported/failed feedback and supports the manual retry workflow without replacing Supabase as the durable record.
- POC views are read-only unless a reviewed server-side endpoint exists for the mutation.
- Existing `apps/admin` workflows remain the owner for translation edits, sync actions, support detail, health checks, and audit-led operations.
- Rollback has been tested by disabling Appsmith access and confirming mobile/admin behavior is unchanged.
- The full-stack owner has approved any production datasource access before the POC touches production.
