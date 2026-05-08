# Architecture Notes

## Current Admin Shape

- `apps/admin` is a standalone Next 15 App Router workspace.
- Admin pages are mostly server components.
- Mutations are centralized in server actions under `apps/admin/app/(dashboard)/actions.ts`.
- Admin identity is currently `profiles.admin_role = 'super_admin'`.
- Service-role Supabase access is isolated to server-side helpers.
- Audit logging already exists through `admin_audit_logs` and `writeAdminAuditLog`.
- Admin forms/tables are semantic HTML and global CSS, not a component library.

## Current Workflow Shape

- Some scheduled/manual work is performed through Supabase Edge Functions.
- Translation sync currently runs synchronously from a Vercel Server Action.
- There is no repo-owned durable workflow plane with retries, schedules, replay, and per-run visibility.
- Existing `translation_sync_runs` is a useful precedent but is domain-specific.

## Current Media Shape

- Supabase is the control plane.
- Cloudflare R2 is the media plane.
- Existing policy requires immutable media paths, manifest-driven delivery, and rollback by pointer/catalog update.
- Mobile audio consumption currently expects chapter-level files through a stream-template strategy.
- Raw LangQuest per-segment artifacts cannot be app-visible until adapted or merged.
- The site R2 proxy currently needs Range/206 support to fully match media policy.

## Current Schema/Security Shape

- Public/mobile tables expose carefully scoped anon/auth reads.
- Internal admin tables use RLS with service-role-only access.
- `admin_audit_logs` should be extended/reused for LangQuest state transitions.
- `supabase/schema.sql` should not be treated as authoritative for planning; migrations are the source of truth.

## Constraints

- Existing dirty files in `src/screens/bible/*` must not be touched by this workstream.
- Do not write LangQuest media into public catalog/verse tables during ingestion.
- Do not create a second canonical admin/data plane through Airtable, Baserow, Directus, or NocoDB.
- Do not add always-on worker infrastructure unless Trigger.dev proves unfit.

## Integration Direction

- Add local admin primitives before adding dense LangQuest screens.
- Add observability and workflow run records before long-running ingestion.
- Add LangQuest control tables as service-role-only Supabase tables.
- Use Trigger.dev as workflow plane.
- Use R2 ingest namespace first, then promote approved artifacts into EveryBible media contract.
