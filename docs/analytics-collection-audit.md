# Usage and approximate-location audit

Audited September 5, 2026. The implementation accompanies this audit. No production
schema, functions, events, or deployments were changed during the audit; release
steps and dependencies are listed below.

## Verified production baseline

The configured Cloudflare IP-location worker and unified Supabase collector both
returned HTTP 200. The deployed collector source matched the repository's prior
implementation. Nightly analytics maintenance succeeded September 4 and 5;
engagement summaries were last updated September 5 at 02:00 UTC.

A read-only 30-day snapshot contained 2,272 events: 887 playback ticks, 520 session
starts, 452 session ends, 263 reading events, 145 chapter completions, three library
actions, and two downloads. All events had session IDs. Of these, 2,176 had
coordinates (95.8%); 96 did not. Of the missing locations, 94 came from 1.0.5,
two from 1.0.6, and none from 1.0.7. Counts will naturally change with activity.
Reading already had coordinates in 252 of 263 events; the report discarded them.
The ingestion pipeline is working, but coverage and metric correctness had gaps.

The analytics table has no raw IP column. A scan found no `ip`, `ip_address`,
`gps`, `latitude`, `longitude`, or `email` keys in existing event properties.
The application uses network IP geography, not GPS permissions. Its IP fallback
contacts ipapi or configured ipinfo; their infrastructure sees the lookup IP.
Cloudflare also observes the requesting IP. This is not anonymous to providers.
No additional location provider or device permission was introduced.

## Confirmed defects and changes

| Boundary | Defect | Change |
| --- | --- | --- |
| Delivery | Queue deleted persisted events before acknowledgment; a crash lost them | Keep the in-flight batch durable until success |
| Delivery | 429 and repeated network failures discarded batches | Retry temporary failures with backoff; serialize requests |
| Delivery | Ambiguous responses could duplicate events; concurrent flushes overlapped | Stable event UUIDs, collector insert-once upsert, one in-flight request |
| Delivery | Small visits waited until background to send | Timed foreground flush, bounded batches |
| Location | In-process cache never expired; old network location followed users | Three-hour TTL applies to both memory and disk; expired fixes do not override the upload location |
| Location | Precise-looking IP decimals persisted; arbitrary source labels accepted | Round to 0.1 degrees at worker/client/collector; reject GPS-labeled payloads; no invented accuracy radius |
| Attribution | Offline events could inherit another account at flush | Capture user ID at collection; attribute only when it matches verified auth; never persist tokens in the queue |
| Reading | Event emitted only on unmount; killed visits lost; hidden tabs counted | Focus and AppState gating; 30-second and background/blur checkpoints |
| Listening | Speed multiplied attention minutes; pause/track transitions lost or misattributed tails | Record elapsed milliseconds; checkpoint transitions; normalize recorded legacy speed at query time |
| Sessions | Signed-in lifecycle and usage had separate IDs; post-background audio suppressed the next start | Share the foreground ID, retain the session owner, explicitly track whether a lifecycle start was emitted |
| Reporting | Today's chart day missing | UTC calendar window includes today; totals and chart use the same bounds |
| Reporting | Reading coordinates and country-only residuals disappeared | Include reading geography and country-center remainder points |
| Reporting | Unlocated translation reading/downloads vanished from tables | Authoritative translation totals independent of location |
| Reporting | Listeners counted zero-minute completions; nearby bucket dedup happened too late | Positive listening only; distinct counts computed after coordinate bucketing |
| Reporting | “Tracked sessions” counted audio visits only | Count actual app session starts, including readers |
| Engagement | Nightly refresh used full audio completions, counted event rows as sessions, and omitted audio-only users | One SQL calculation for nightly/admin/self refresh with database aggregation, avoiding API row limits |
| Operations | Missing collection was invisible | Collection-health panel with event counts, latest activity/delivery and location coverage |

## Data contract and limits

New mobile events include a UUID `event_id`, optional collection-time user ID,
`queued_at`, platform, app version and `analytics_schema_version: 2`. Reading
contains chapter, translation and incremental foreground seconds. Playback ticks
contain incremental elapsed milliseconds, chapter, translation, rate and progress.
Downloads represent completed text packs or audio books, not every audio chapter.
Library and book-hub interactions remain aggregate product events.

No new cross-session device identifier, GPS, contacts, advertising identifier,
or raw IP persistence was added. Existing historical IP coordinates remain in the
database unchanged; reports group them coarsely. Geolocation is approximate and
can be wrong for VPNs/carriers. Offline events with a fresh captured location keep
it; otherwise location reflects upload time. Unlocated usage remains in totals.
Anonymous “listeners” are sessions, not known unique human beings.

The queue retains up to 500 pending events and rejects additional events at that
bound. Transient delivery faults no longer consume a retry budget. This is bounded
telemetry, not a guarantee of lossless collection during indefinitely long offline
use. Checkpoints reduce force-quit loss, but the current partial interval can still
be lost on abrupt termination. Missing historical events cannot be reconstructed;
locations that were never captured are not guessed from profiles or present IPs.

## Verification

- Behavioral tests reproduced queue loss, rate-limit drops, overlapping sends,
  stale location, duplicate inserts, invalid coordinates, and identity changes.
- Real PostgreSQL semantics tested in isolated in-memory PGlite: today included,
  bucket dedup, reading-only map points, unlocated totals, positive listeners,
  app session counts, collection coverage, legacy speed conversion, retained
  rollup agreement, engagement and service-only function permissions.
- Full workspace tests: 1,655 passing with no skipped tests.
- Root lint/typecheck, admin lint/typecheck/build, Expo config, worker typecheck
  and Deno checks passed. Two worker privacy regressions also passed. The
  existing admin font lint and Next workspace-root warnings remain unrelated.
- Live read-only RPC with the corrected date window includes September 5; its
  daily listening sum was 1,723.4 minutes versus a rounded 1,723-minute headline.
- Chrome local preview: reading selection shows four approximate Nepal buckets;
  health expands to event types, receipt/activity timestamps and missing coverage.
  Preview data is synthetic. The temporary QA route is removed before final build.

To run isolated SQL verification without Docker or a production database:

```sh
npm install --prefix /tmp/everybible-analytics-sql --no-audit --no-fund @electric-sql/pglite
PGLITE_MODULE=/tmp/everybible-analytics-sql/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/verify-analytics-sql.mjs
node --test --import tsx workers/geo/index.test.ts
```

## Release order

1. Verify the exact approved checkout and reconcile the existing migration ledger
   differences before a bulk push. Read-only inspection found local
   `20260710150000_analytics_authoritative_listener_counts.sql` applied remotely
   as `20260710153150`, plus earlier duplicate/reconciled migration versions.
   Do not run an indiscriminate database push.
2. Apply `20260905060000_repair_usage_reporting.sql`, then
   `20260905061000_align_engagement_usage.sql`. The first adds nullable
   `received_at`, reporting functions and recomputes retained monthly aggregates.
   Neither deletes or rewrites raw event rows. The second unifies engagement
   calculations. Use the isolated SQL test first.
3. Deploy the two ingestion functions and `aggregate-engagement`, then the
   existing `workers/geo` worker. The schema must precede collectors because
   inserts now include `received_at`. Older app payloads remain accepted.
4. Deploy admin. Verify a real authenticated operator sees today's chart,
   collection diagnostics, reading locations and unlocated translation totals.
   Invoke the authorized engagement refresh and verify summary updates.
5. Release the mobile update after collector dedup is live. Verify a real
   signed-out and signed-in reading/listening visit, airplane-mode retry,
   background/resume, a rate-limited retry and no GPS permission prompt.

No production ingestion smoke events were written during the audit. Backend and
mobile release remain required to change what deployed clients collect. Roll back
code through its previous revision; retain the additive receipt column and raw
events. Old clients remain compatible with the updated collector.
