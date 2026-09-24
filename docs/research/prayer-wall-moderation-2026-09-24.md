# Prayer Wall: moderation for App Store Guideline 1.2 (2026-09-24)

Follow-up to PW5 in `docs/research/prayer-wall-health-check-2026-09-24.md`. The prayer wall
can't be reached in the app yet (`config.features.studyGroupsSync` is `false`, and nothing
navigates to `GroupList`), so this work gets it ready to ship. Guideline 1.2 requires four
things of an app with user-generated content. This branch builds the first three and the
tooling for the fourth. The fourth also needs the owner (see the last section).

| Guideline 1.2 asks for                                   | What exists now                                                                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A way to filter objectionable material                   | A server-side word and phrase filter. A trigger rejects new or edited requests. Admins edit the term list on the Reports page. The existing 500-character limit and the blank-request check still apply. |
| A way to report offensive content, with timely responses | A report button on every request that isn't yours, with a reason and an optional note. Admins act on reports from the new admin **Prayer Reports** page.                                                 |
| A way to block abusive users                             | Block this person, per member. The blocked member's requests disappear for the blocker.                                                                                                                  |
| Published contact information                            | **Owner.** The terms have a contact email but no content policy (see below).                                                                                                                             |

## How it behaves

**Report.** Long-press a request, or tap the new "…" button on its card (VoiceOver users get
a "More actions" custom action). Pick Report, choose a reason (spam or advertising,
harassment or hate, sexual content, violence or self-harm, something else), and optionally add
a note of up to 500 characters. The app calls `report_prayer_request`. Then:

- The request disappears for the reporter straight away, through RLS, and stays hidden for
  them even after an admin restores it.
- When 3 different members have open reports on it, it is hidden for the whole group,
  leader included (`hidden_reason = 'reports'`), until an admin reviews it.
- The author still sees their hidden request, marked "Under review", so hiding it doesn't
  prompt them to repost.
- A member can file 10 reports per rolling hour and 30 per day (`PT429`). A second report on
  the same request is ignored. Members can't report their own requests, or requests in groups
  they aren't in.
- Reports are stored in `prayer_request_reports`, which only the service role can read. Each
  report keeps a copy of the text as it was when reported, because the author can edit it
  afterwards.

**Block.** Pick "Block this person" and confirm. This writes a row to `user_blocks`, which only
the blocker can read. The blocked member's requests disappear for the blocker, both from the
wall and from interactions. The block works one way: the blocked member isn't told and still
sees the blocker's requests. The service has `unblockUser`, but no screen lists blocked people
yet (see below).

**Filter.** The `enforce_prayer_wall_rules` trigger checks every insert, and every update
that changes `content`, against `prayer_content_filter_terms`:

- A `word` term must appear as a whole word. The text is lowercased, NFKC-normalized and
  stripped of invisible characters, and punctuation counts as a space.
- A `substring` term matches anywhere once spaces and punctuation are removed. Use it for
  scripts written without spaces (Chinese, Korean, Hindi compounds) and for stems that take
  prefixes or suffixes.

A match raises `prayer_request_blocked_content` (`PT422`), and the app shows
`prayer.contentRejected`. The starter list has 42 terms across 13 languages: slurs, "kill
yourself"-style abuse, and a few unambiguous obscenities. It deliberately leaves out words
with innocent meanings, because a false match blocks someone's prayer. The terms live only as
data in the migration and the table. They aren't in comments or in this doc. The filter is
easy to evade (spaced-out letters, look-alike characters), which is why it sits alongside
reporting rather than replacing it.

**Ban.** A row in `prayer_wall_bans` makes the same trigger refuse posts and edits from that
member on every wall (`prayer_wall_banned`, `PT403`). The app shows `prayer.postingBlocked`.
A banned member can still delete their own requests.

**Admin (`apps/admin`, `/prayer-reports`, in Operations).** The page lists reported requests,
one row per request, with the most open reports first. Each row shows the current text, the
reported text when the author has edited it since, the group and author IDs, and every report
with its reason, note, date and status. The actions are:

- Hide (closes the open reports as `actioned`).
- Restore (dismisses them).
- Delete, which needs a confirmation box. The text is kept in the audit log as evidence.
- Ban author, with an optional reason. This also hides every visible request by the author
  and closes their reports.
- Lift ban. Requests hidden by the ban stay hidden.
- Add or remove filter terms. The term list is collapsed by default because it contains
  offensive language.

Every action writes an `admin_audit_logs` row, the same way the other admin pages do.
`app/serverBoundaryAuth.test.ts` automatically checks that each action requires a
`super_admin`.

## Design notes

- Hidden state lives in `prayer_requests.hidden_at` / `hidden_reason`, and the SELECT policy
  enforces it. `protect_prayer_request_moderation` is a SECURITY INVOKER trigger. When the
  caller is `anon` or `authenticated`, it keeps the stored values. Inside the report RPC
  (which runs as the table owner) and for the service role, `current_user` is a different
  role, so those writes go through.
- The SELECT policy calls `private.viewer_reported_prayer_request(id)`, a SECURITY DEFINER
  helper that only answers about the caller's own reports. `authenticated` has EXECUTE on it
  but no USAGE on `private`, the same arrangement as `private.is_group_member`.
- `report_prayer_request` is a SECURITY DEFINER function in `public`, so the Supabase
  advisor will list it under `authenticated_security_definer_function_executable`. This is
  intended, just like `join_group_by_code`. It checks `auth.uid()`, group membership and the
  rate limit itself.
- The Android long-press menu drops its Cancel button when a leader has three actions,
  because Android alerts show at most three buttons. Tapping outside the menu cancels it. The
  report form is a `Sheet`, because Android alerts can't hold a text field.
- A leader can't delete a request they have reported, or one from someone they have blocked,
  because it is hidden for them. The admin handles those.
- Removing the `eslint-disable` for exhaustive-deps from `PrayerWallScreen` let the React
  Compiler lint the whole screen. It flagged the initial-load effect, so the effect no longer
  sets `isLoading` synchronously (the state already starts `true`).

## Verification

- `PGLITE_MODULE=<pglite>/dist/index.js node scripts/verify-prayer-wall-sql.mjs`: 14
  sections pass. The new sections were written before the migration and failed without it.
  They cover reports (service-only table, hidden for the reporter, auto-hidden at 3, the
  author still sees it, no un-hiding by clients, the rate limit), blocks, the filter
  (word/substring, case, spacing), bans, and account deletion removing a member's reports and
  blocks. The admin writes run as `service_role`. That caught a real bug, now fixed: the
  filter-term CHECK constraint calls `private.normalize_prayer_text` as the writing role, and
  `service_role` had no EXECUTE on it.
- Live, read-only: 0 rows in `prayer_requests`. `harden_prayer_wall` is applied. The
  policies match the repo. The database collation is `en_US.UTF-8`, and `lower()`,
  `normalize(…, nfkc)` and `[[:punct:]]` handle Cyrillic, accented letters and CJK
  punctuation as the filter expects.
- App: `prayerService.test.ts` and `prayerModel.test.ts` cover the report RPC payload and
  errors, block and unblock, the content, ban and rate-limit codes, and the action matrix.
  Admin: `prayer-moderation.test.ts` and `prayer-reports/actions.test.ts`. There are 19 new
  `prayer.*` strings, translated in all 21 locales, and the i18n coverage and rendering
  suites pass.
- `npm test`, `npm run typecheck`, the admin typecheck, and lint on the changed files all
  pass.

## Deploy order

1. Apply `supabase/migrations/20260924180000_prayer_wall_moderation.sql`. It depends on
   `20260924042617_harden_prayer_wall.sql`, which is already live. It changes no data. If you
   apply it with MCP `apply_migration`, rename the repo file to the version MCP records. Then
   run the post-apply checks at the end of the file.
2. Deploy the admin app. `everybible-admin` auto-deploys when `main` is pushed. Open
   `/prayer-reports`: it should show an empty queue and the 42 starter terms.
3. The app changes ship with the next build. They do nothing until the wall is reachable. Only
   turn on `studyGroupsSync` once steps 1 and 2 are live.

## Still needs the owner

1. **Terms / EULA.** `legal/terms.html` and `apps/site/app/terms` have no section on
   user-generated content. Add one that says there is zero tolerance for objectionable
   content or abusive users, lists what isn't allowed, and explains that reported content is
   reviewed and removed, and offenders banned, within 24 hours. Give a contact address for
   reports. The current terms list a personal address; a dedicated support address would be
   better.
2. **Agreement before posting.** App Review usually expects members to accept those terms
   before they can post. Add a one-time "I agree" gate to the prayer wall (and group chat, if
   that is added) once the copy exists. It needs new strings in all 21 locales.
3. **Report alerts.** Nothing tells anyone a new report has arrived, so the 24-hour promise
   depends on someone checking `/prayer-reports`. Choose a channel (email, Slack, or a daily
   digest from `pg_cron`/an edge function) and who is on call.
4. **Filter list review.** Ask a native speaker to check the starter terms for each language,
   especially the Arabic, Hindi, Korean and Chinese substring terms, and add terms for
   Bengali, Marathi, Punjabi, Telugu, Tamil, Urdu, Nepali and Japanese, which have none yet.
5. **Blocked-people list.** Decide whether members need a screen to review and unblock
   people. `unblockUser` exists. The screen would need new strings, and since authors show as
   "Group member", it would also need a way to identify who is blocked.
6. **Still open from the health check:** PW9 (edit on Android, un-answer) and PW10 (screen
   reader state).
