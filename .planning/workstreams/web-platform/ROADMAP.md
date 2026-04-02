# Roadmap: EveryBible Web Platform

## Overview

This roadmap treats the EveryBible web effort as a parallel workstream to the active mobile milestone. The goal is not full web parity. The goal is to ship:

- a strong public marketing site on `everybible.app`
- a separate internal admin platform on `admin.everybible.app`
- shared Supabase-backed operational rails that help the team distribute content, manage dynamic app content, monitor health, support users, and understand usage

This roadmap also explicitly tries to avoid rebuilding common admin and dashboard primitives from scratch when permissive OSS can responsibly accelerate delivery.

## Execution Model

This roadmap should be executed in three lanes:

- `A` lane: architecture/backend/risk-heavy work by `gpt-5.4`
- `B` lane: frontend/UI delivery by `gpt-5.4-mini`
- `C` lane: integration/review gate by `gpt-5.4`

See `EXECUTION-LANES.md` for the detailed split and responsibilities.

## Phase Plan

- [x] **Phase 1: Web Monorepo And Platform Foundation** - Add the repo, package, auth, env, deployment, and shared-contract rails for two Vercel-hosted Next.js apps
- [x] **Phase 2: Public Marketing Site V1** - Ship the public brand/acquisition website on `everybible.app`
- [x] **Phase 3: Admin Auth, Shell, And Internal Navigation** - Ship `admin.everybible.app` with secure sign-in, `super_admin` gating, layout, and core module scaffolding
- [x] **Phase 4: Upstream Translation Sync And Distribution Operations** - Show upstream-imported translation/distribution state, sync health, manual resync, and EveryBible-local status/metadata controls
- [x] **Phase 5: Verse Of The Day And Image Content Operations** - Add EveryBible-owned content management for verse-of-the-day and promotional/content images with scheduling and publish states
- [x] **Phase 6: Content Health And Readiness Checks** - Add operational visibility for missing assets, broken states, stale imports, and content readiness failures
- [x] **Phase 7: User And Support Visibility** - Add internal support views for users, devices, auth, and sync context
- [x] **Phase 8: Listening Minutes And Map Reporting** - Add privacy-safe analytics dashboards for listening minutes, real download aggregates, and coarse geography
- [x] **Phase 9: Hardening, Auditability, And Role Expansion Prep** - Tighten audit trails, admin UX quality, release confidence, and future role/permissions seams

## Phase Details

### Phase 1: Web Monorepo And Platform Foundation

**Goal:** Create the web platform rails inside the existing repo without disrupting the mobile app.

**Success Criteria**

1. Repo can host `apps/site` and `apps/admin` cleanly with shared packages and clear boundaries.
2. Both apps can be deployed independently on Vercel.
3. Shared Supabase web/auth patterns are defined and secure enough for later admin features.
4. OSS decisions for core primitives are documented before implementation begins.

**Likely OSS Leverage**

- `vercel/next-forge` for repo/app/package layout ideas
- `shadcn-ui/ui` for design-system primitives
- `supabase/auth` and existing Supabase stack for auth model/reference

### Phase 2: Public Marketing Site V1

**Goal:** Launch a credible public website that explains EveryBible and drives app installs.

**Success Criteria**

1. Visitors understand the product quickly from the hero and supporting sections.
2. Visitors understand the larger mission to provide God's Word free of charge in every language.
3. App-store / download CTAs are prominent and trustworthy.
4. Legal/support pages are reachable and consistent with the product.
5. Marketing content stays code-managed and reviewable in Git.
6. Homepage direction can intentionally follow a Bible.com-style near-clone when that better serves clarity and trust.

**Likely OSS Leverage**

- `shadcn-ui/ui` for accessible sections, dialogs, navigation, and forms
- patterns from `next-forge` for marketing site structure and SEO setup

### Phase 3: Admin Auth, Shell, And Internal Navigation

**Goal:** Ship a secure internal shell for `admin.everybible.app` before deeper data modules are added.

**Success Criteria**

1. Only `super_admin` users can access admin routes.
2. Admin shell includes module navigation, page scaffolding, and internal design consistency.
3. Shared auth/session patterns are explicit and testable.
4. Public and admin domains remain cleanly separated in deployment and config.

**Likely OSS Leverage**

- `shadcn-ui/ui` for admin chrome and primitives
- `react-admin` as a pattern/reference library for CRUD ergonomics, not necessarily as the default framework

### Phase 4: Upstream Translation Sync And Distribution Operations

**Goal:** Make EveryBible admin operationally useful for imported translation/distribution data from the upstream system.

**Success Criteria**

1. Admin can view imported translation/distribution records and freshness.
2. Admin can identify sync failures and safely trigger manual resync.
3. Admin can edit EveryBible-local metadata/status fields only.
4. Upstream source state and EveryBible distribution state are clearly separated in the UI and data model.

**Likely OSS Leverage**

- `TanStack/table` for dense filtering, sorting, and data-heavy admin lists
- `supabase-community/sql-examples` as a reference source for reporting/admin SQL patterns

### Phase 5: Verse Of The Day And Image Content Operations

**Goal:** Give internal staff direct ownership of dynamic app content EveryBible actually manages.

**Success Criteria**

1. Admin can manage verse-of-the-day entries and images with `draft -> scheduled -> live` states.
2. Uploads, previews, and status transitions are understandable and safe.
3. Mobile content contracts support bundled defaults plus remote overrides.
4. Content records are operationally separate from upstream translation-authoring data.

**Likely OSS Leverage**

- `react-hook-form` for content forms
- `Uppy` for file upload flows
- `Keystone` as a reference option if content workflows later outgrow custom forms

### Phase 6: Content Health And Readiness Checks

**Goal:** Detect and surface the operational failures most likely to hurt the mobile experience.

**Success Criteria**

1. Missing images, stale daily content, broken publish states, and stale imports are visible from admin.
2. Health views help staff prevent issues before app users notice them.
3. Checks stay focused on asset/readiness validation first.

**Likely OSS Leverage**

- `TanStack/table` for issue triage lists
- `Recharts` for readiness/failure trend visualization where useful

### Phase 7: User And Support Visibility

**Goal:** Help internal staff understand user/account/device/sync state without overreaching into unsafe mutations.

**Success Criteria**

1. Support staff can find users and inspect support-relevant state.
2. Views stay mostly read-only and safe at first.
3. Device/auth/sync visibility is enough to answer common operational questions.

**Likely OSS Leverage**

- `TanStack/table` for search/detail views
- `react-admin` patterns for resource/detail layouts if helpful

### Phase 8: Listening Minutes And Map Reporting

**Goal:** Turn existing or planned telemetry into useful internal reporting without violating the privacy boundary.

**Success Criteria**

1. Admin can view listening-minute aggregates over time.
2. Admin can view real Bible download aggregates over time.
3. Admin can view coarse geography on a globe without exposing raw precise pins.
4. Reporting contracts are stable enough for future expansion.

**Likely OSS Leverage**

- `Recharts` for dashboard charts
- `CesiumGS/cesium` for globe visualization
- open country metadata for coarse centroid lookup

### Phase 9: Hardening, Auditability, And Role Expansion Prep

**Goal:** Prepare the admin platform for long-term operational use after the first valuable workflows are live.

**Success Criteria**

1. Admin actions leave enough metadata for later audit surfaces.
2. Release, testing, and deployment workflow for both web apps is explicit.
3. Data/auth boundaries can evolve toward more granular roles later without a rewrite.

**Likely OSS Leverage**

- selective reuse of the same Phase 1-8 stack instead of introducing a second admin framework late

## Execution Notes

- This roadmap is planning-only until explicitly approved for execution.
- Each phase should be decomposed into `A` / `B` / `C` execution blocks before implementation starts.
- Each phase should get its own later `CONTEXT`, `RESEARCH`, `PLAN`, `VALIDATION`, and `SUMMARY` artifacts when execution is authorized.
- Strong-copyleft dependencies should be screened out unless explicitly approved.

### Phase 10: Admin Codex operator for guided site and data changes

**Goal:** Add an OpenClaw-powered EveryBible operator that can be reached from Telegram, retain durable memory, use Codex/GPT-5.4-class reasoning, and safely change approved site/data surfaces through audited tools.
**Requirements**: COPILOT-01, COPILOT-02, COPILOT-03, COPILOT-04, COPILOT-05, COPILOT-06
**Depends on:** Phase 9
**Plans:** 3 plans

Plans:
- [ ] `10-01-PLAN.md` — Add the Supabase homepage override contract, deterministic site fallback, and operator audit visibility
- [ ] `10-02-PLAN.md` — Add the OpenClaw EveryBible plugin package, Telegram/ACP bootstrap assets, and reviewable code-change routing
- [ ] `10-03-PLAN.md` — Activate the real local OpenClaw host, verify Telegram pairing/allowlist, and add the public-site floating operator launcher

**Success Criteria**

1. Jeremy can message the EveryBible operator from Telegram through OpenClaw.
2. The operator retains durable memory across sessions without storing secrets unsafely.
3. The operator can read and safely mutate approved EveryBible content/data through explicit audited tools.
4. The EveryBible homepage can consume live override content while preserving code-managed fallback behavior.
5. Requests that require source-code edits route into a reviewable Codex/Git/GitHub workflow instead of hidden production mutation.
6. Bible assets can move to Cloudflare R2 for app delivery while listening/download analytics stay on the existing reporting rails used by the website/admin platform.

**Likely OSS Leverage**

- `openclaw/openclaw` for Telegram, memory, agent runtime, and ACP interoperability
- current OpenClaw plugin/tool patterns for EveryBible-specific mutation tools
- existing Supabase and GitHub CLI rails already present in this repo/workspace

---
*Last updated: 2026-04-02*
