---
gsd_state_version: 1.0
workstream: web-platform
status: In Progress
execution_authorized: true
last_updated: "2026-04-02T19:45:00Z"
progress:
  total_phases: 10
  completed_phases: 9
  total_plans: 9
  completed_plans: 9
---

# Workstream State

## Current Position

- Workstream type: parallel to the active mobile milestone
- Current stage: Phases `1` through `9` complete; Phase `10` is now active for the OpenClaw-based operator
- Public-site note: the homepage, support/legal pages, and real store/legal links are now live in the site app
- Setup note: if admin env is missing, the admin app now renders a setup state with the exact missing keys instead of returning a raw 500
- Backend note: shared mobile-content and analytics rollups are now codified as Supabase RPC contracts instead of being rebuilt separately in site/admin code
- Next recommended action: plan and execute Phase 10 so the EveryBible operator can be reached from Telegram, retain memory, and safely mutate approved site/data surfaces

## Locked Decisions

- Same GitHub repo as the mobile app
- Two separate Next.js apps
- Two separate Vercel deployments/domains
- Shared Supabase backend
- Admin-only website login
- One `super_admin` role first
- Upstream translation creation stays outside EveryBible
- EveryBible admin owns verse-of-the-day and promotional/content images directly
- Mobile app uses bundled defaults plus remote overrides
- Map reporting stays coarse/privacy-safe
- Geography reporting should be driven by real telemetry and open-license visualization/data building blocks instead of placeholder SVG or fake pin placement
- The live admin map stack should use MapLibre with an open basemap and privacy-safe country centroids instead of a heavy 3D globe dependency
- OpenClaw is the preferred control plane for the EveryBible operator when Telegram access and durable memory are required
- Codex/GPT-5.4-class reasoning should remain underneath the OpenClaw runtime for high-agency tasks

## Planning Artifacts

- `PROJECT.md` — workstream scope and architecture
- `REQUIREMENTS.md` — traceable web/admin requirements
- `ROADMAP.md` — phased rollout plan
- `EXECUTION-LANES.md` — model split between `gpt-5.4` and `gpt-5.4-mini`
- `OSS-RESEARCH.md` — permissive-license reuse opportunities
- `docs/plans/2026-04-01-everybible-web-admin-workstream-design.md` — high-level design brief

## Known Unknowns

- upstream API resources, auth model, and delta sync behavior will still need production-environment validation
- current telemetry source assumptions for listening minutes and geography should be confirmed against live production data as the updated download events begin arriving from fresh mobile builds
- future non-`super_admin` role boundaries remain intentionally deferred until real operator usage informs them

## Guardrails

- Execution is approved; continue phase-by-phase with `A/B/C` lane discipline
- Keep the mobile milestone root `.planning` files separate from this workstream
- Reuse OSS where it reduces cost without forcing the wrong product architecture
- Keep mutation tools narrow, explicit, and audit-logged; do not grant arbitrary production authority to the agent

---
*Last updated: 2026-04-02*
