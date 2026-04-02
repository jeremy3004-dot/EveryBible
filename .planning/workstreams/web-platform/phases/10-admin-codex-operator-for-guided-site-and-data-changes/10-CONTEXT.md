# Phase 10: OpenClaw operator for Telegram, memory, and guided site/data changes - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Source:** Repo inspection, OpenAI docs review, user request

<domain>
## Phase Boundary

This phase adds an OpenClaw-powered EveryBible operator that can be reached from Telegram, retain memory across sessions, and safely change approved EveryBible site/data surfaces.

It must use OpenClaw as the outer runtime/control plane, preserve Codex/GPT-5.4-class reasoning/coding capability underneath, and support real approved mutations to site content and admin-managed data through narrow EveryBible server-side tools.

The first concrete "change the site from the site" capability should be homepage content mutation for `apps/site`, implemented through a Supabase-backed content contract with deterministic code fallback.

This phase is not about arbitrary public AI access, arbitrary browser-driven code editing, or bypassing the existing Git/review/deploy workflow.

</domain>

<decisions>
## Implementation Decisions

### Operator scope
- OpenClaw is the runtime/control plane for the operator.
- Telegram is the primary human-facing interface.
- The operator acts as a guide first and an executor second.

### Model and API boundary
- OpenClaw should host the assistant identity, channel routing, and memory.
- The underlying reasoning/coding capability should remain Codex/GPT-5.4 class through the provider or ACP path OpenClaw supports.
- Tool/function calling should be explicit and server-defined through EveryBible tools/plugins.

### Mutation boundary
- The model must not receive arbitrary SQL or filesystem authority.
- All live mutations must go through explicit EveryBible tools implemented in-repo.
- Every mutation must be audit-logged with actor identity and change metadata.

### Site mutation strategy
- Preserve current code-managed homepage content as the fallback source of truth.
- Add a remote homepage content contract in Supabase for live overrides.
- Have `apps/site` read the live homepage payload server-side and fall back safely when unset or invalid.

### Code change handling
- Requests that require source-code changes should be routed into Codex/ACP or a Git/GitHub-backed change-request path instead of pretending to hot-edit production code.
- Honesty about safe limits is part of the feature.

### Memory expectations
- The assistant should retain useful context across Telegram sessions.
- Cross-session memory should be enabled through the current OpenClaw memory mechanism, with Honcho used if that is the recommended up-to-date path.
- Secrets should not be stored in memory.

### Initial tool surface
- Start with homepage content read/update plus a small set of operational summary tools that ground the assistant in current admin state.
- Do not broaden into unrestricted content or support mutations in the first cut.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Workstream planning
- `.planning/workstreams/web-platform/ROADMAP.md` — phase boundaries and phase 10 dependency on phase 9
- `.planning/workstreams/web-platform/REQUIREMENTS.md` — traceable web/admin requirements and the new OpenClaw operator requirements to be added here
- `.planning/workstreams/web-platform/STATE.md` — current workstream state and locked decisions
- `docs/plans/2026-04-01-everybible-web-admin-workstream-design.md` — existing web/admin design brief
- `docs/plans/2026-04-02-everybible-codex-operator-design.md` — this phase's design direction

### Admin implementation seams
- `apps/admin/lib/admin-auth.ts` — super-admin gate to preserve
- `apps/admin/lib/audit-log.ts` — audit sink to extend/reuse
- `apps/admin/lib/env.ts` — env contract pattern to mirror for EveryBible tool env
- `apps/admin/lib/supabase/service.ts` — service-role data access seam
- `apps/admin/app/(dashboard)/actions.ts` — existing server-action pattern for privileged admin mutations
- `apps/admin/app/globals.css` — reusable admin UI primitives

### OpenClaw integration seams
- OpenClaw latest stable release and docs — runtime, Telegram channel, memory, ACP, and plugin guidance
- GitHub CLI/auth in this workspace — available for future code-change routing and automation

### Site content implementation seams
- `apps/site/lib/site-content.ts` — current code-managed homepage content fallback
- `apps/site/app/page.tsx` — homepage renderer that should consume the new contract
- `apps/site/app/api/mobile/content/route.ts` — example of shared Supabase RPC-powered content delivery
- `apps/site/lib/supabase/service.ts` — site-side service client seam

### Data contracts
- `supabase/migrations/20260401130000_create_web_admin_platform.sql` — core admin platform schema
- `supabase/migrations/20260402091500_unify_shared_backend_contracts.sql` — shared contract and RPC direction for web/mobile/admin

</canonical_refs>

<specifics>
## Specific Ideas

- The user explicitly wants the agent to be OpenClaw if possible, so it can be messaged from Telegram and keep perpetual memory.
- The user still wants "deep codex 5.4" quality, so OpenClaw should be the runtime while Codex/GPT-5.4 remains the underlying reasoning/coding layer.
- "Change the site from the site" should first mean homepage marketing content changes from admin, backed by remote overrides.
- Existing audit logging and Supabase-backed content/data patterns should be reused instead of replaced.
- GitHub tooling is available and authenticated in this workspace, so code-change requests can later integrate with GitHub-backed review flows.

</specifics>

<deferred>
## Deferred Ideas

- public-site anonymous agent access
- arbitrary code editing from browser prompts
- arbitrary SQL tools
- broad autonomous GitHub PR generation without approval
- multi-role approval workflows
- fully custom memory infrastructure if OpenClaw's current memory path is sufficient for MVP

</deferred>

---

*Phase: 10-admin-codex-operator-for-guided-site-and-data-changes*
*Context gathered: 2026-04-02 via repo inspection and OpenAI docs review*
