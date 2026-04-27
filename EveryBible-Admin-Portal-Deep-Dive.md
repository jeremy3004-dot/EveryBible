# EveryBible Admin Portal — Deep Dive & Strategic Recommendations

**Date:** April 15, 2026  
**Scope:** Vision assessment, architecture audit, gap analysis, and GitHub tooling recommendations

---

## 1. Executive Summary

The EveryBible admin portal at **admin.everybible.app** is a surprisingly mature internal tool for a project of this scale. It's a Next.js 15 app backed by Supabase with real analytics, geo visualization, content scheduling, user support tooling, and audit logging. The vision is clearly to be a **single-pane-of-glass operations center** for Bible content distribution, user engagement, and system health.

**What it does well:**
- Content lifecycle management (translations, Verse of the Day, images with scheduling windows)
- Read-only user support inspection (devices, engagement, preferences, reading history)
- Real-time analytics with geographic heatmap (MapLibre GL globe visualization)
- System health monitoring (stale syncs, missing content, config readiness)
- Full audit trail on every admin action
- AI-powered operator chat for admin assistance
- Clean, dark-mode-first design with Cormorant Garamond + DM Sans typography

**Where the vision falls short:**
- No push notification campaign management (tokens stored, no campaign UI)
- No feature flags UI (some settings exist in DB, no toggle interface)
- No content moderation dashboard (prayer requests, group content are unmoderated)
- No A/B testing infrastructure
- No error monitoring / crash reporting integration
- No background job visibility (cron jobs run silently)
- No email/communication system
- No status page or uptime monitoring for users

---

## 2. Current Architecture Assessment

### 2.1 What's Built (and Built Well)

**The Monorepo Structure**
```
EveryBible/
├── apps/admin/        ← Next.js 15 admin portal (Vercel-deployed)
├── apps/site/         ← Public website (Next.js 15)
├── supabase/          ← 46+ migrations, 5 edge functions
├── cloudflare/        ← Analytics collector + geo worker
├── scripts/           ← 47+ data management scripts
└── src/               ← Expo/React Native mobile app
```

This is a well-organized monorepo with Turbo orchestration, shared packages (`@everybible/env`, `@everybible/types`), and clear separation between mobile, web, and backend.

**Database Schema — Comprehensive**

The Supabase schema covers:

| Domain | Tables | Maturity |
|--------|--------|----------|
| User identity & preferences | profiles, user_preferences, user_devices | Solid — RLS on everything |
| Reading progress & streaks | user_progress, user_engagement_summary | Strong — engagement scoring formula |
| Content management | translation_catalog, translation_versions, verse_of_day_entries, content_images | Good — scheduling windows, state machines |
| Groups & community | groups, group_members, group_sessions, prayer_requests, prayer_interactions | Functional — join codes, soft delete |
| Reading plans | reading_plans, reading_plan_entries, user_reading_plan_progress | Mature — recurring + timed variants |
| Analytics | analytics_events (with 3-tier geo enrichment) | Impressive — Cloudflare edge → Supabase pipeline |
| Admin operations | admin_audit_logs, translation_sync_runs | Professional-grade audit trail |

**Edge Functions — Smart Architecture**

The 5 Supabase edge functions show good architectural thinking:

1. **track-analytics-events** — 3-tier geo resolution (CF header → ipapi.co free → ipinfo.io paid)
2. **track-anonymous-usage-events** — Separate pipeline for pre-auth tracking
3. **aggregate-engagement** — Nightly cron computing weighted engagement scores
4. **send-group-notification** — Expo Push fan-out with batch limiting (100/request)
5. **submit-chapter-feedback** — DB insert + Google Sheets export (graceful degradation)

The engagement scoring formula is thoughtful:
- 35% reading (chapters/100)
- 25% listening (minutes/500)
- 20% streak (days/30)
- 10% plans completed (×5 each)
- 10% community (prayers + annotations / 20)

**Admin Portal Pages**

| Section | Path | What It Does |
|---------|------|-------------|
| Dashboard | `/` | KPI overview (translations, failed syncs, live verses, images, support users) |
| Translations | `/translations` | Catalog management, distribution state, sync history, version tracking |
| Verse of the Day | `/content/verse-of-day` | Create/schedule/publish daily verse with reflection and images |
| Content Images | `/content/images` | Upload with state management (draft → scheduled → live → archived) |
| User Support | `/support/users` | Read-only user inspection (devices, engagement, preferences, plans) |
| Health Monitor | `/health` | Stale sync detection, missing content, configuration readiness |
| Analytics | `/analytics` | Global usage: reading/listening minutes, downloads, geo heatmap, translation engagement |
| Settings | `/settings` | Admin roles, audit log history |
| Operator Chat | `/api/operator/chat` | AI-assisted admin operations |

### 2.2 What's Missing (Gap Analysis)

**Tier 1 — High Impact, Should Exist Already**

1. **Push Notification Campaigns** — You store device tokens in `user_devices` and can fan-out via `send-group-notification`, but there's no campaign builder, audience segmentation, scheduling, or delivery reporting. Every notification requires code.

2. **Feature Flags** — The `user_preferences` table has a `hide_play_button_from_reading_tab` flag, suggesting you've needed per-user toggles. But there's no system for rolling out features gradually, targeting segments, or kill-switching broken releases.

3. **Error Monitoring** — No Sentry, no crash reporting, no error tracking. When the app crashes on a user's phone, you don't know unless they tell you. For a production app this is a significant blind spot.

4. **Background Job Visibility** — The `aggregate-engagement` cron runs nightly but there's no dashboard showing: did it run? How long? Did it fail? Same for translation syncs. These are fire-and-forget.

**Tier 2 — Would Significantly Improve Operations**

5. **Content Moderation** — Prayer requests and group content flow into the database unmoderated. As the user base grows, this becomes a liability. No flagging, no review queue, no automated filtering.

6. **Email/Transactional Messaging** — No email infrastructure for password resets (Supabase default), group invites, Verse of the Day email delivery, or re-engagement campaigns.

7. **Uptime/Status Page** — No public-facing status page for when Supabase, Cloudflare, or the app itself has issues. Users have no way to know if a problem is on their end.

8. **A/B Testing** — You're making content and UX decisions (translation ordering, reading plan prominence, onboarding flows) without data on what works better.

**Tier 3 — Strategic Enhancements**

9. **Admin UI CRUD Generation** — Every new entity (reading plans, prayer requests, groups) requires hand-writing admin pages. A framework like Refine could auto-generate these from your Supabase schema.

10. **Real-Time Group Collaboration** — The group study features are async-only. Real-time shared notes, live cursors, or synchronized reading would differentiate the app.

11. **Advanced Bible Study Tools** — Cross-references, concordance, interlinear Hebrew/Greek, commentary layers. Open-source datasets exist for all of these.

12. **CI/CD Maturity** — Only one GitHub Action (Android production release). No PR preview builds, no automated testing in CI, no iOS CI pipeline.

---

## 3. GitHub Tools You Don't Have (But Should)

### 3.1 Immediate Priority — Fill Critical Gaps

#### PostHog (31,000+ stars) — Replace Custom Analytics + Add A/B Testing + Error Tracking
**Why this is #1:** PostHog is a single platform that replaces your custom analytics pipeline, adds A/B testing, feature flags, session replay, and error tracking. It's self-hostable and has React Native SDKs.

- **What it replaces:** Your custom `analytics_events` pipeline, Cloudflare analytics-collector worker, and the `aggregate-engagement` edge function
- **What it adds:** Session replay, funnel analysis, A/B experiments, feature flags, error tracking
- **Integration:** React Native SDK → PostHog Cloud or self-hosted → Next.js admin reads PostHog API
- **Trade-off:** Your current pipeline is privacy-respecting and lightweight. PostHog is heavier but far more capable. You could run both in parallel during migration.
- **Repo:** github.com/PostHog/posthog

#### Unleash (12,000+ stars) — Feature Flags
**Why:** OpenFeature-compatible, self-hosted, battle-tested. Your `hide_play_button_from_reading_tab` pattern shows you need this.

- **What it enables:** Gradual rollouts of new translations, kill-switch for broken features, per-segment targeting (by country, device, plan)
- **Integration:** Node.js SDK in Next.js admin, React Native SDK in mobile app, Supabase edge functions can check flags via REST API
- **Alternative:** Flagsmith (5,000+ stars) — simpler UI, also OpenFeature-compatible
- **Repo:** github.com/Unleash/unleash

#### GlitchTip — Error Monitoring (Sentry-Compatible)
**Why:** Drop-in Sentry replacement using the same client SDKs. Self-hosted, lighter weight than full Sentry.

- **What it enables:** Crash reports from mobile app, error alerts, stack traces with source maps
- **Integration:** `@sentry/react-native` SDK → GlitchTip server (Docker)
- **Alternative:** Self-hosted Sentry (heavier) or Rejourney (React Native-specific, lighter)
- **Repo:** gitlab.com/glitchtip/glitchtip (GitLab, not GitHub)

### 3.2 High Value — Operational Improvements

#### BullMQ (14M+ monthly npm downloads) — Background Job Management
**Why:** Your nightly engagement aggregation, translation syncs, content scheduling, and notification fan-outs all run as fire-and-forget processes. BullMQ gives you queuing, retries, scheduling, and a dashboard.

- **What it enables:** Visible job queues, retry logic, cron scheduling with monitoring, rate limiting
- **Dashboard:** Bull Board or Arena for job visibility in admin portal
- **Integration:** Redis-backed, runs alongside Supabase. Admin portal gets a "Jobs" page showing queue health
- **Repo:** github.com/taskforcesh/bullmq

#### Trigger.dev — Alternative to BullMQ (Managed)
**Why:** If you don't want to manage Redis infrastructure. Serverless TypeScript workflows with built-in observability.

- **What it enables:** Same as BullMQ but managed. Better for small teams.
- **Trade-off:** Less control, vendor dependency, but zero infrastructure
- **Repo:** github.com/triggerdotdev/trigger.dev

#### Upptime (16,000+ stars) — Status Page
**Why:** Free, GitHub-powered uptime monitoring with a public status page. Zero infrastructure cost.

- **What it enables:** Public status page at status.everybible.app, uptime checks every 5 minutes, outage history, Slack/email notifications
- **Integration:** GitHub Actions-powered, status page on GitHub Pages
- **Repo:** github.com/upptime/upptime

#### React Email / MJML — Email Templates
**Why:** You have no email infrastructure beyond Supabase's default auth emails.

- **MJML (17,500+ stars):** Markup language for responsive emails. Battle-tested.
- **React Email:** Write emails as React components. Integrates naturally with Next.js.
- **What it enables:** Branded password reset emails, group invite emails, Verse of the Day email digest, re-engagement campaigns
- **Repos:** github.com/mjmlio/mjml, github.com/resend/react-email

### 3.3 Strategic — Differentiation & Growth

#### Refine (8,400+ stars) — Admin UI Framework
**Why:** Every new admin feature (reading plan management, prayer request moderation, group oversight) requires hand-coding CRUD pages. Refine auto-generates them from your Supabase schema.

- **What it enables:** Auto-generated list/create/edit/show pages for any Supabase table, built-in access control, real-time updates
- **Integration:** Has a native Supabase data provider. Drop into your existing Next.js admin app.
- **Trade-off:** Your current admin has a custom design language (Cormorant Garamond + maroon accent). Refine would need theming work to match.
- **Repo:** github.com/refinedev/refine

#### Drizzle ORM — Type-Safe Database Queries
**Why:** Your admin portal's `admin-data.ts` builds raw Supabase queries. Drizzle gives you type-safe SQL with better bundle size than Prisma.

- **What it enables:** Type-safe queries that catch schema mismatches at compile time, better migration tooling, cleaner join syntax
- **Integration:** First-class Supabase support, works with your existing PostgreSQL schema
- **Repo:** github.com/drizzle-team/drizzle-orm

#### content-checker — Content Moderation
**Why:** Prayer requests and group content need moderation as your user base grows.

- **What it enables:** AI-powered text moderation (profanity, hate speech, inappropriate content), runs on-device or server-side
- **Integration:** Call from Supabase edge function on prayer_request insert, or batch-process in admin
- **Repo:** github.com/utilityfueled/content-checker

#### Bible-Specific Open Source
- **bible_databases** (scrollmapper) — 340,000+ cross-references from openbible.info. Would power a cross-reference feature in the reader.
- **awesome-bible-developer-resources** — Curated list of 200+ Bible APIs, concordances, and text databases. Essential reference.
- **Bible Go API** — Dockerized REST API with cross-references. Could power a public Bible API for EveryBible.
- **Repos:** github.com/scrollmapper/bible_databases, github.com/biblenerd/awesome-bible-developer-resources

#### Yjs (4,500+ stars) — Real-Time Collaboration
**Why:** Group Bible study is currently async-only. Yjs enables real-time shared notes, synchronized reading, and collaborative annotation.

- **What it enables:** Live group study sessions with shared cursors, collaborative note-taking, offline editing that syncs when reconnected (CRDT)
- **Integration:** Works with React Native, can use Supabase Realtime as transport
- **Repo:** github.com/yjs/yjs

### 3.4 CI/CD Enhancements

#### expo-github-action — Expo in GitHub Actions
**Why:** You only have one GitHub Action (Android production release). No iOS CI, no PR previews, no automated testing.

- **What it enables:** PR preview builds, automated iOS builds, EAS integration in CI
- **Repo:** github.com/expo/expo-github-action

**Recommended CI pipeline additions:**
- Lint + typecheck on every PR (you have the scripts, just no CI trigger)
- `npm run test:release` on every push to main
- PR preview builds via EAS (so testers can try branch work)
- Automated TestFlight submission on main merge (with your existing guard scripts)

---

## 4. Prioritized Roadmap Recommendation

### Phase 1 — Foundation (Weeks 1-3)
**Goal:** Fill the three most dangerous gaps

1. **Add error monitoring** — GlitchTip or Sentry. You're flying blind on crashes.
2. **Add CI/CD basics** — Lint + typecheck + test:release on every PR via GitHub Actions
3. **Add Upptime status page** — Takes 30 minutes to set up, gives users visibility

### Phase 2 — Operations (Weeks 4-8)
**Goal:** Make the admin portal a true operations center

4. **Add feature flags via Unleash** — Start with translation rollouts and UI experiments
5. **Add BullMQ for job visibility** — Wrap your existing crons in queues, add a "Jobs" page to admin
6. **Add push notification campaign UI** — Build on existing Expo Push + user_devices infrastructure
7. **Add content moderation** — Automated filtering on prayer_requests + manual review queue

### Phase 3 — Growth (Weeks 9-16)
**Goal:** Data-driven decisions and user engagement

8. **Evaluate PostHog** — Run alongside custom analytics, decide if consolidation makes sense
9. **Add email infrastructure** — React Email + Resend/Supabase for transactional + Verse of the Day digest
10. **Add Bible cross-references** — Import scrollmapper dataset, surface in reader
11. **Expand admin with Refine** — Auto-generate CRUD for reading plans, groups, prayer management

### Phase 4 — Differentiation (Ongoing)
12. **Real-time group study** — Yjs for collaborative annotation
13. **A/B testing** — Via PostHog or standalone GrowthBook
14. **Public Bible API** — Based on your data, using Bible Go API patterns

---

## 5. What You're Doing Better Than Most

It's worth calling out what's genuinely impressive here:

- **The 3-tier geo enrichment** on analytics (CF header → free API → paid API) is a smart cost optimization pattern. Most apps just throw everything at a paid service.
- **Engagement scoring with weighted formula** is more thoughtful than most apps manage. The breakdown (35% reading, 25% listening, 20% streak, 10% plans, 10% community) shows real product thinking.
- **Audit logging on every admin action** from day one is something most teams add years later after a compliance scare.
- **Content scheduling with state machines** (draft → scheduled → live → archived) on images and Verse of the Day is production-grade content management.
- **The TestFlight release guard system** with build number sync, IPA pre-checks, and distribution verification is more thorough than most teams' entire release process.
- **47+ data management scripts** covering Bible data import, audio processing, asset publishing, and catalog management — this is a serious content pipeline.

The admin portal vision is clear and well-executed for its current scope. The gaps are normal for a team at this stage — they're about scaling operations, not fundamental architecture problems.

---

## 6. Architecture Risks to Watch

1. **Custom analytics aging** — Your pipeline works today but will struggle with funnel analysis, cohort analysis, and retention curves. PostHog solves this comprehensively.

2. **Fire-and-forget edge functions** — The nightly engagement aggregation and translation sync have no alerting. A silent failure means stale data for days.

3. **No content moderation at all** — Prayer requests go directly into the database. One bad actor in a group could cause real harm. This is a liability, not just a feature gap.

4. **Single GitHub Action** — Your release process has excellent local tooling (TestFlight guards, pre-checks) but almost no CI automation. This makes releases dependent on the person who knows the scripts.

5. **Annotation sync gap** — Annotations are completely local (no cloud sync). Users who lose their phone lose all bookmarks, highlights, and notes. This is a silent data loss vector.
