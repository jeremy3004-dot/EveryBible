# Requirements: EveryBible Web Platform

**Defined:** 2026-04-01
**Core Value:** EveryBible has a polished public web presence and an internal admin platform that supports distribution, content operations, health monitoring, support visibility, and privacy-safe reporting without replacing the upstream translation-authoring system.

## Website Requirements

- [x] **SITE-01**: Visitor can land on `everybible.app` and immediately understand what EveryBible is, who it is for, and what actions to take next
- [x] **SITE-01A**: Visitor can clearly understand the mission to get the whole Bible into every language and provide God's Word free of charge in people's own language
- [x] **SITE-02**: Visitor can see strong hero, product value sections, screenshots/mockups, and clear app download CTAs
- [x] **SITE-03**: Visitor can access required legal/support pages from the website
- [x] **SITE-04**: Website content is code-managed initially and can ship independently of admin tooling

## Admin Access And Security

- [x] **ADMIN-01**: Internal staff can sign into `admin.everybible.app` using the shared auth system
- [x] **ADMIN-02**: Only users marked as `super_admin` can access admin routes
- [x] **ADMIN-03**: Admin app keeps public and internal domains, sessions, and environment configuration cleanly separated
- [x] **ADMIN-04**: Admin actions can be audited or at least leave enough metadata to support future audit logging

## Translation Distribution Operations

- [x] **DIST-01**: Admin can view imported translation/distribution records sourced from the upstream API
- [x] **DIST-02**: Admin can see sync status, freshness, and failure states for upstream translation imports
- [x] **DIST-03**: Admin can manually trigger a safe resync/reimport workflow when upstream data needs refreshing
- [x] **DIST-04**: Admin can edit EveryBible-local translation metadata/status fields without pretending to author translations upstream
- [x] **DIST-05**: Admin can distinguish between upstream source state and EveryBible distribution state

## Content Operations

- [x] **CONTENT-01**: Admin can create, edit, schedule, publish, unpublish, and archive verse-of-the-day entries
- [x] **CONTENT-02**: Admin can upload, manage, and retire promotional/content images used by the mobile app
- [x] **CONTENT-03**: Verse-of-the-day and image content follow a `draft -> scheduled -> live` publishing workflow
- [x] **CONTENT-04**: Mobile app can consume admin-managed content through remote overrides while keeping bundled defaults

## Content Health And Readiness

- [x] **HEALTH-01**: Admin can see failures or missing states for translation imports, distribution readiness, images, and verse-of-the-day content
- [x] **HEALTH-02**: Admin can identify missing assets before they degrade the mobile experience
- [x] **HEALTH-03**: Health checks focus first on asset/readiness validation, not full in-app rendering automation

## User And Support Visibility

- [x] **SUPPORT-01**: Admin can search for users and inspect account state relevant to support workflows
- [x] **SUPPORT-02**: Admin can inspect device/auth/sync context needed to understand common support issues
- [x] **SUPPORT-03**: User/support visibility stays read-only at first except for clearly approved safe actions

## Analytics And Reporting

- [x] **ANALYTICS-01**: Admin can view listening-minute metrics in a useful reporting surface
- [x] **ANALYTICS-02**: Admin can view Bible usage on a coarse location map without exposing precise device-level coordinates
- [x] **ANALYTICS-03**: Reporting contracts and aggregation pipelines are explicit enough to evolve later
- [x] **ANALYTICS-04**: Admin can view real download heatmaps and real listening heatmaps sourced from coarse country aggregates rather than placeholder geography

## OpenClaw Operator

- [ ] **COPILOT-01**: Jeremy can message an EveryBible OpenClaw operator from Telegram and keep a durable assistant identity across sessions
- [ ] **COPILOT-02**: The OpenClaw operator uses Codex/GPT-5.4-class reasoning or coding capability underneath the OpenClaw runtime rather than a weak generic assistant configuration
- [ ] **COPILOT-03**: The operator can read and safely mutate approved EveryBible site/data surfaces only through explicit audited tools
- [ ] **COPILOT-04**: The public website homepage can consume admin-managed or agent-managed live content overrides while preserving deterministic code-managed fallback content
- [ ] **COPILOT-05**: Operator-triggered changes leave clear audit evidence of actor, action, target, and changed fields
- [ ] **COPILOT-06**: Requests that require real source-code edits are routed into a Git/Codex/GitHub-backed workflow instead of hidden direct production mutation

## Operational Constraints

- [x] **OPS-01**: Web platform reuses permissive-license OSS building blocks where they meaningfully reduce implementation cost
- [x] **OPS-02**: Web platform does not force a rewrite of the existing mobile app architecture
- [x] **OPS-03**: Web platform remains compatible with Vercel deployment and Supabase-backed data/auth/storage patterns

## Out Of Scope For Initial Execution

| Feature | Reason |
|---------|--------|
| Normal-user website login | Website is for public marketing plus internal admin only |
| Translation authoring and source-of-truth editing | That responsibility lives in the upstream system |
| Precise location pin storage in admin | Privacy-safe aggregates are sufficient for the stated use case |
| Full granular RBAC at launch | One `super_admin` role is faster and enough to validate workflows |
| Full mobile-web feature parity | This workstream is about marketing and operations first |

## Traceability

| Requirement | Planned Phase |
|-------------|---------------|
| SITE-01 | Phase 2 |
| SITE-01A | Phase 2 |
| SITE-02 | Phase 2 |
| SITE-03 | Phase 2 |
| SITE-04 | Phase 2 |
| ADMIN-01 | Phase 3 |
| ADMIN-02 | Phase 3 |
| ADMIN-03 | Phase 1 / Phase 3 |
| ADMIN-04 | Phase 3 / Phase 9 |
| DIST-01 | Phase 4 |
| DIST-02 | Phase 4 |
| DIST-03 | Phase 4 |
| DIST-04 | Phase 4 |
| DIST-05 | Phase 4 |
| CONTENT-01 | Phase 5 |
| CONTENT-02 | Phase 5 |
| CONTENT-03 | Phase 5 |
| CONTENT-04 | Phase 5 |
| HEALTH-01 | Phase 6 |
| HEALTH-02 | Phase 6 |
| HEALTH-03 | Phase 6 |
| SUPPORT-01 | Phase 7 |
| SUPPORT-02 | Phase 7 |
| SUPPORT-03 | Phase 7 |
| ANALYTICS-01 | Phase 8 |
| ANALYTICS-02 | Phase 8 |
| ANALYTICS-03 | Phase 8 |
| ANALYTICS-04 | Phase 8 |
| COPILOT-01 | Phase 10 |
| COPILOT-02 | Phase 10 |
| COPILOT-03 | Phase 10 |
| COPILOT-04 | Phase 10 |
| COPILOT-05 | Phase 10 |
| COPILOT-06 | Phase 10 |
| OPS-01 | Phase 1 |
| OPS-02 | Phase 1 |
| OPS-03 | Phase 1 |

---
*Last updated: 2026-04-01*
