# Prayer Wall: health check (2026-09-24)

Scope: `src/screens/learn/PrayerWallScreen.tsx`, `src/services/prayer/*`, the prayer card in
`GroupDetailScreen`, and the live `prayer_requests` / `prayer_interactions` tables, policies,
triggers and grants on project `ganmududzdzpruvdulkg`. I only ran read-only SQL against the
live project. Companion to `docs/research/groups-health-check-2026-09-24.md`.

## State of the feature

- **Users can't reach it.** The only route to `PrayerWall` is the prayer card in
  `GroupDetail`. Only `GroupList` leads to `GroupDetail`, and nothing navigates to
  `GroupList` (no screen and no `linkingConfig` entry). `config.features.studyGroupsSync` is
  `false`. Most client findings are therefore latent. Anyone calling PostgREST directly can
  still reach the RLS findings today.
- **Live data:** 0 rows in `prayer_requests` and `prayer_interactions`.
- **Policy drift:** none. Live `pg_policies` match the repo: the 7 policies from
  `20260322140500`, and `prayer_update_creator` as rewritten by `20260923233220`. The UPDATE
  policy now calls `private.is_group_member(group_id)` after the helper move
  (`20260924035932`). The `forbid_scope_change('group_id','user_id')` and `updated_at`
  triggers are both live.

## Who can see what

- **Scope:** every request belongs to a group. There is no public or private setting, and
  no anonymous posting. Only current members of the group can read, post or interact.
  Outsiders and `anon` get nothing. A former member loses read access but can still delete
  their own requests and interactions.
- **Author identity:** `select *` returns `user_id` (a UUID) to every member, and
  interactions expose who prayed. The UI shows "Group member" rather than a name, but that
  isn't anonymity. `profiles` is readable only by its owner, so names don't leak, but the
  leader's UUID is public in `groups.leader_id`. That makes the leader's requests
  identifiable, and all of one author's requests can be linked together. This is fine
  while nothing promises anonymity. If anonymous posting is ever offered, it needs a view
  or RPC that strips `user_id`.

## Findings

Each **Fixed** item was fixed on this branch, test first.

| #    | Severity        | Finding                                                                                                                                                                                                                                                                                                              | Status                                                                                                                                                                                                                                           |
| ---- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PW1  | Medium (latent) | **Deleting a leader's account deleted the whole group.** `groups.leader_id` cascades from `profiles`, so deleting the account (through `delete_my_account()`, the dashboard or the admin API) deleted every group the user led. Every other member's requests, interactions and sessions went with it.               | Fixed: a `BEFORE DELETE` trigger on `profiles` passes leadership to the longest-standing member first. A group with no other members is still deleted. The deleted user's own requests and interactions still cascade.                           |
| PW2  | Medium          | **Clients controlled the timestamps.** The wall is sorted by `created_at DESC`, and authors could set it on insert or update. A request dated 2099 would stay pinned to the top. `answered_at` could hold any value and didn't have to match `is_answered`, which was also nullable.                                 | Fixed: a trigger sets `created_at` on insert and keeps it fixed after that. `answered_at` is set when a request is first marked answered and cleared if it is unmarked. `is_answered` is now `NOT NULL`.                                         |
| PW3  | Medium          | **No posting limit.** A member could flood every group they belong to.                                                                                                                                                                                                                                               | Fixed: 10 requests per author per rolling hour and 30 per rolling day, across all groups (SQLSTATE `PT429`). The app shows a new translated notice, `prayer.rateLimited`.                                                                        |
| PW4  | Medium (latent) | **Prayed/encouraged state was lost on reload.** The wall only remembered taps from the current screen visit. After a reload, a request the user had already prayed for showed as not prayed. Tapping it added 1 locally while the server ignored the duplicate, and a second tap removed the real prayer.            | Fixed: `listPrayerRequests` returns `viewer_prayed` / `viewer_encouraged`, and the screen starts from them.                                                                                                                                      |
| PW5  | Medium (latent) | **Moderation couldn't be reached.** RLS lets the leader delete any request, but the service filtered deletes on `user_id = me` and only the author got the long-press menu. There is also no report, block or content filter. A shipped wall will need those under App Store Guideline 1.2 (user-generated content). | Partly fixed: deletes now go by id, and the leader gets a "remove" action with a new translated hint, `prayer.leaderLongPressHint`. A delete that RLS silently skips is now reported as a failure. **Open:** report, block and a content filter. |
| PW6  | Low             | **Failures were silent.** A failed edit, mark-answered or delete showed nothing, and a failed post showed "Error / Retry".                                                                                                                                                                                           | Fixed: each failure shows an alert, using existing keys.                                                                                                                                                                                         |
| PW7  | Low             | **Blank requests were accepted.** A request of only spaces passed the 1–500 length check.                                                                                                                                                                                                                            | Fixed: new `prayer_requests_content_not_blank` check.                                                                                                                                                                                            |
| PW8  | Info            | **Unused privileges.** `anon` held every privilege on both tables, and `authenticated` held TRUNCATE, REFERENCES and TRIGGER. TRUNCATE bypasses RLS, but PostgREST doesn't expose it.                                                                                                                                | Fixed: those privileges are revoked.                                                                                                                                                                                                             |
| PW9  | Low             | **Android can't edit or un-answer.** Edit uses `Alert.prompt`, which exists only on iOS, so Android has no edit. Nobody can un-mark a request as answered.                                                                                                                                                           | Open (product decision).                                                                                                                                                                                                                         |
| PW10 | Low             | **Screen reader state.** Each card is a single VoiceOver/TalkBack element. The Prayed/Encouraged custom actions don't announce whether they're on, and a toggle gives no spoken feedback. Labels, roles, the header and the hints are otherwise in place.                                                            | Open: this needs new strings for "you prayed". Do it when the feature ships.                                                                                                                                                                     |
| PW11 | Low             | **Offline.** The wall works only online. Every call first does a network `getUser()`. A failed load shows a retry screen, a failed tap is rolled back, and a failed post keeps the draft. Nothing is cached, which is acceptable for a live community feed.                                                          | No change.                                                                                                                                                                                                                                       |
| PW12 | Info            | **Interactions aren't rate-limited.** The unique key allows one prayed and one encouraged per user per request, and nothing sends a notification. Toggling repeatedly only creates write load.                                                                                                                       | No change.                                                                                                                                                                                                                                       |

## Verification

- `PGLITE_MODULE=<pglite>/dist/index.js node scripts/verify-prayer-wall-sql.mjs` replays the
  group and prayer migrations, including the two applied live today when they are present.
  It then applies Supabase's default grants and `20260924160000`, and checks reads, the
  timestamps, content limits, the rate limit, interactions, deletion and moderation, and
  account deletion, all as `authenticated`/`anon`. Before the migration it failed at
  "insert ignores a client created_at"; after it, all 7 sections pass.
- `src/services/prayer/prayerService.test.ts` and `prayerModel.test.ts` cover the new
  behaviour: viewer state, rate-limit mapping, delete by id with the zero-rows check, and
  the long-press action matrix.
- `npm test` (5299 pass), `npm run typecheck`, and the i18n coverage and rendering suites
  all pass.

## Needs a live step

1. Apply `supabase/migrations/20260924160000_harden_prayer_wall.sql`. It changes no data
   (0 rows). Its header lists the post-apply checks.
2. Before `studyGroupsSync` is turned on, add reporting, blocking and a content filter
   (PW5), and settle PW9 and PW10.
