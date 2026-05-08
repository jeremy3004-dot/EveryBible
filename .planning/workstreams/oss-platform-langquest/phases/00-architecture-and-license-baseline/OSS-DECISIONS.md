# OSS Decisions

## Adopt Now

| Capability | Decision | License | Notes |
| --- | --- | --- | --- |
| Runtime validation | Zod | MIT | Low-risk server-side parsing for admin actions, LangQuest manifests, and workflow payloads. |
| R2 client | `@aws-sdk/client-s3` | Apache-2.0 | Already used by `apps/site`; keep using for R2-compatible operations. |

## Adopt In This Workstream

| Capability | Decision | License | Notes |
| --- | --- | --- | --- |
| Workflow plane | Trigger.dev | Apache-2.0 | Best fit for TS jobs, schedules, retries, replay, and current Vercel/Supabase deployment shape. |
| Audio metadata | `music-metadata` | MIT | Use server-side for duration/content metadata where possible. |

## Adopt Gradually Behind Local Primitives

| Capability | Decision | License | Notes |
| --- | --- | --- | --- |
| Admin tables | TanStack Table | MIT | Defer until tables need client-side sorting/filtering/column controls. Preserve server-rendered tables first. |
| Admin forms | React Hook Form | MIT | Defer until forms become complex enough to justify client-side form state. Keep server-action forms for simple flows. |
| Admin component library | shadcn/ui | MIT | Do not wholesale restyle admin. Copy patterns or components only behind local `components/admin/*` primitives. |

## Optional Later

| Capability | Decision | License | Notes |
| --- | --- | --- | --- |
| Error tracking | GlitchTip | MIT | Preferred Sentry-compatible OSS backend; SDK choice/config belongs in Phase 2. |
| Analytics/flags | PostHog | MIT core/open-core | Good fit for admin events and feature flags; avoid putting sensitive payloads into events. |
| Search | Meilisearch CE | MIT | Add after real LangQuest volume exists. Use as an index, not source of truth. |
| Support | Chatwoot | MIT | Add only if custom support queue grows beyond admin-only triage. |
| Spreadsheet mirror | Baserow | MIT core/open-core | Mirror/export only. Never canonical ownership or publishing state. |
| CMS | Payload CMS | MIT | Future editorial tool only if current admin content workflows outgrow bespoke screens. |
| Policy engine | Casbin | Apache-2.0 | Add only if roles exceed simple role table/RLS checks. |
| Audio merge/transcode | FFmpeg | LGPL/GPL build-dependent | Use only if merged chapter derivatives are required. Pin build/license before production. |

## Reject For Core Control Plane

| Tool | Reason |
| --- | --- |
| Directus | Competes with Supabase/admin schema ownership and risks a second canonical admin plane. |
| NocoDB | Spreadsheet UI is not a durable publishing/ownership control plane. |
| ToolJet | Splits operator UX and permission model from `apps/admin`. |
| n8n | Less ideal for typed product-coupled workflows, idempotency, and provenance than Trigger.dev here. |
| Airtable | Useful as a mirror/handoff surface only; not canonical. |
