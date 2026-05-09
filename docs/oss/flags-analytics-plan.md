# Feature Flags and Analytics Adoption Plan

## Recommendation

Adopt Unleash as a separate feature-flag service only after the current Supabase analytics pipeline has a stable flag-context field and an operator runbook. Keep EveryBible's Bible-domain analytics as the source of truth. Treat PostHog as optional, secondary product-analytics tooling for web/admin funnel exploration, not as the canonical store for listening minutes, reading minutes, translation adoption, downloads, geo rollups, or engagement summaries.

## Repo Evidence

- Mobile analytics already queue and flush events through `src/services/analytics/analyticsService.ts`, with bounded queues, app/session metadata, geo enrichment, a Supabase Edge Function path, and an RPC fallback.
- Anonymous usage metrics in `src/services/analytics/anonymousUsageAnalytics.ts` cover `session_started`, `session_ended`, `chapter_completed`, `audio_playback_progress`, and `reading_ended`; these are important because they capture activity even when auth is absent or delayed.
- Bible experience events in `src/services/analytics/bibleExperienceAnalytics.ts` are deliberately domain-shaped and local/testable: book hub opens, companion opens, library actions, and feedback actions.
- `supabase/functions/track-analytics-events/index.ts` authenticates the caller, merges client-provided approximate geo with request-derived Cloudflare/ipapi/ipinfo context, and inserts rows into `analytics_events` via service role.
- `apps/admin/lib/analytics-reporting.ts` builds admin-facing models from event rollups, including country/location metrics, translation breakdowns, listening minutes, reading minutes, downloads, and privacy-safe coordinate bucketing.
- Migrations show the current contract is not generic clickstream analytics. It has evolved through `analytics_events`, `user_engagement_summary`, geo columns, playback progress, reading time, corrected geo fallback, per-translation analytics, and consistent user-count rollups.
- README scripts already define the verification gates to use after any future implementation: `npm run test`, `npm run typecheck`, `npm run admin:typecheck`, `npm run admin:build`, and `npm run release:verify` when release-impacting.

## OSS Scout Result

**Best option:** Unleash as a separate feature-management service.

- License: Apache-2.0 for Open Source, per Unleash documentation and GitHub repository.
- Commercial fit: good for self-hosting as a separate service.
- Copyleft risk: low.
- Recommended use mode: separate self-hosted service, not app-embedded custom fork.

**Optional option:** PostHog for exploratory product analytics only.

- License: MIT for the main repo except the `ee` directory, per the PostHog GitHub README.
- Commercial fit: acceptable with care; self-hosted OSS is positioned as a hobby/advanced deployment and PostHog recommends cloud above roughly 100k events/month.
- Copyleft risk: low for MIT code, but paid/enterprise feature boundaries must be reviewed.
- Recommended use mode: external analytics sink or cloud project for secondary analysis, not canonical data storage.

**Rejected as source of truth:** using PostHog or Unleash metrics to replace `analytics_events` or `get_admin_analytics_overview`.

Why: EveryBible's analytics schema encodes Bible-specific semantics, privacy-safe location handling, anonymous/authenticated event realities, and admin translation rollups that generic tools would flatten or duplicate.

Sources checked: [Unleash feature availability](https://docs.getunleash.io/support/availability), [Unleash GitHub](https://github.com/Unleash/unleash), [PostHog GitHub README](https://github.com/PostHog/posthog).

## Target Architecture

Unleash owns release decisions. Supabase owns facts.

1. Mobile/admin code asks a small internal flag adapter for feature state.
2. The flag adapter resolves from local defaults first, then Unleash when configured.
3. Analytics events continue through existing EveryBible services and Edge Functions.
4. Events may include non-sensitive flag context such as `flag_keys`, `flag_variants`, and `experiment_id`.
5. Admin reporting continues to read Supabase RPCs and `analytics_events`.
6. Optional PostHog receives mirrored, reduced, non-sensitive events for funnel/product exploration only.

Do not send Bible text, search queries, prayer content, annotations, raw IP addresses, exact device GPS, email, auth tokens, or free-text feedback into Unleash or PostHog.

## Staged Plan

### Stage 0: Contract Freeze

Do this before adding any service.

- Document the canonical event names and property shapes currently used by mobile, anonymous usage, Edge Functions, and admin reporting.
- Add an `analytics_schema_version` or equivalent property to newly emitted analytics events only if needed for migrations.
- Define a small list of safe flag-context properties that may ride along on events: flag key, boolean state, variant key, rollout rule, and experiment key.
- Define forbidden analytics properties: personally identifying data, Bible note contents, prayer text, exact location, raw user agent, IP, and full auth identity.
- Acceptance: admin analytics can still derive listening minutes, reading minutes, downloads, country/location rollups, translation rollups, and `userCountWithListening` entirely from Supabase.

### Stage 1: Unleash Read-Only Evaluation

Goal: validate operational fit without affecting user behavior.

- Self-host Unleash in a non-production environment with persistent Postgres and backups.
- Create environments that map to EveryBible release surfaces: `development`, `staging`, and `production`.
- Create flags for internal-only admin or low-risk UI toggles first. Avoid Bible reading, audio playback, sync, auth, purchases, or data deletion flows.
- Build a tiny feature-flag adapter in a future implementation. It should expose explicit defaults and support a hard local kill switch.
- Capture flag evaluation diagnostics internally, but do not write user-level flag data to Unleash beyond what the SDK requires.
- Acceptance: a disabled Unleash endpoint or missing token leaves the app on safe local defaults and does not block startup, analytics flush, Bible reading, audio, auth, or sync.

### Stage 2: Low-Risk Flagged Releases

Goal: use flags for progressive rollout without polluting canonical analytics.

- Start with non-core admin UI changes or mobile presentation changes where old behavior remains available.
- Add flag context to existing EveryBible analytics events only for the flagged feature being evaluated.
- In admin reports, compare canonical Supabase metrics by flag context where useful, but continue to compute totals from the same `analytics_events` table.
- Avoid creating a second event taxonomy in Unleash. Unleash can answer "who saw which variant"; Supabase answers "what happened in Bible usage."
- Acceptance: rollback is possible by turning the flag off, and the Supabase metrics remain coherent when the flag is disabled mid-window.

### Stage 3: Optional PostHog Pilot

Goal: answer product questions that are hard to answer in the current admin dashboard without moving the source of truth.

- Use PostHog only for web/admin funnels, onboarding drop-off, feature discovery, and non-sensitive experiments.
- Prefer server-side mirroring from the existing analytics ingestion layer or admin web app, not a broad mobile SDK that collects extra device/session data by default.
- Mirror a reduced event set with stable IDs that are pseudonymous and revocable.
- Disable session replay for mobile and any screen that can expose Bible notes, prayer content, search terms, feedback text, or auth/profile data.
- Keep all Bible-domain dashboards and operational reporting in Supabase/admin.
- Acceptance: deleting or disabling PostHog has no effect on `analytics_events`, admin analytics, engagement summaries, app behavior, or release rollback.

### Stage 4: Production Governance

Goal: make flags boring and auditable.

- Require owner, expiry date, rollout intent, and rollback instruction for every production flag.
- Review flags weekly and remove stale flags after rollout.
- Keep flag names stable and domain-readable, for example `reader_companion_v2`, `admin_translation_heatmap_filter`, or `audio_progress_flush_tuning`.
- Add a production runbook covering Unleash outage, flag misconfiguration, SDK token rotation, and emergency disable.
- Acceptance: no production flag exists without owner, default, expiry, and rollback note.

## When Not To Adopt

Do not adopt Unleash yet if:

- There is no owner for flag cleanup and production governance.
- The first use case is a core data path where a stale or wrong flag can corrupt sync, Bible progress, downloads, auth, or analytics ingestion.
- The team only needs compile-time configuration or app-store release gating.
- Offline-first behavior cannot be guaranteed from local defaults.
- The operational burden of hosting, backups, upgrades, and secrets outweighs the rollout risk being reduced.

Do not adopt PostHog if:

- The goal is to replace Supabase admin analytics.
- The required questions are already answered by `get_admin_analytics_overview`.
- The event volume would push self-hosted OSS beyond comfortable operating limits.
- Session replay or autocapture would collect sensitive faith, prayer, note, search, location, or identity context.
- The team cannot maintain a strict allowlist of mirrored event names and properties.

## Data Privacy Rules

- Canonical analytics remain in Supabase, protected by existing RLS/service-role boundaries and admin RPCs.
- Location must stay approximate. Continue bucketing map coordinates and prefer "unknown location" over profile-country fallback when event-level geo is missing.
- Never mirror raw `event_properties` wholesale to third-party or optional analytics tools.
- Use pseudonymous IDs for optional analytics. Do not send email, name, profile country as location fallback, auth tokens, or raw Supabase user objects.
- Treat Bible notes, prayers, feedback text, and search queries as sensitive content.
- Keep retention explicit: raw Supabase analytics may have one retention policy, optional PostHog data should have a shorter pilot retention unless a privacy review approves otherwise.

## Rollback Plan

- For Unleash: every flag must have a safe local default. If Unleash is unavailable, SDK initialization fails closed to defaults. Emergency rollback is flag off first, app release second only if the flagged code path itself is broken.
- For analytics context: stop emitting flag context by removing it from the adapter or ingestion allowlist; existing Supabase rollups should ignore unknown properties.
- For PostHog: disable mirroring at the server/app config layer, rotate the key, and leave Supabase analytics untouched.
- For bad data: mark the impacted flag or optional analytics window in the admin runbook; do not backfill over canonical Bible metrics without a migration and verification query.

## Acceptance Checklist

- [ ] No new dependency is added until a concrete implementation task is approved.
- [ ] `analytics_events` remains the canonical event log.
- [ ] Admin reporting continues to use Supabase rollups for listening, reading, downloads, geo, sessions, and translation metrics.
- [ ] Flag defaults are local, explicit, and safe for offline startup.
- [ ] Unleash outage does not block app startup or analytics flush.
- [ ] Optional PostHog receives only allowlisted, reduced events.
- [ ] No sensitive Bible, prayer, note, feedback text, exact location, or auth data leaves the current trusted analytics path.
- [ ] Each production flag has owner, expiry date, rollout intent, and rollback instruction.
- [ ] Verification plan includes relevant repo scripts from README/package scripts: `npm run test`, `npm run typecheck`, `npm run admin:typecheck`, `npm run admin:build`, and `npm run release:verify` for release-impacting changes.
