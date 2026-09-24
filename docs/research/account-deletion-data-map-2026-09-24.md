# What happens to a user's data when they delete their account (2026-09-24)

## Summary

When someone taps **Delete account**, the app first removes their files (avatar,
recorded feedback answers), then calls `delete_my_account()`, which deletes the
`auth.users` row. The rest is done by foreign keys: nearly all personal rows are
deleted, analytics are kept without the user link, and a few admin and content
records keep the row but lose the author. After that the phone signs out and
deletes that account's private notes from the device.

Most of this is right. This audit found four bugs and fixed them on this branch:

1. **Deletion could fail.** A former group leader who had assigned a reading
   plan could not delete their account. The foreign key
   `group_reading_plans.assigned_by` was `NO ACTION`, so after they handed
   leadership to someone else the delete returned a foreign-key error.
   Reproduced on a scratch Postgres (PGlite); fixed by the migration.
2. **Kept feedback still named the person.** Chapter feedback is kept after
   deletion on purpose (`user_id` is set to null), but each row also stores the
   contributor's name, ID number, IP hash and the path of their recorded answer.
   The path includes their uid. None of that was cleared. Fixed by the
   migration.
3. **Backup tables outlived the account.** The `backups` schema holds copies
   of `user_preferences` (including the feedback name and ID number),
   `user_reading_plan_progress` and `user_engagement_summary`. These tables have
   no foreign keys, so the copies stayed after deletion. Fixed by the
   migration, which deletes the user's rows from every `backups` table that has
   a `user_id uuid` column.
4. **Queued analytics kept the deleted uid on the phone.** Analytics events
   waiting to upload keep the uid they were recorded under. After deletion they
   stayed in the phone's storage and were uploaded with that uid in the body.
   The server stored them without a user, because it only attributes an event
   to a valid token, but the phone should not keep or send the uid. Fixed in
   the client: the deleted account's queued events are anonymised, matching the
   server's `ON DELETE SET NULL`.

Everything else in the list below is a policy choice for the owner. Those are
only documented here.

Sources: live database `ganmududzdzpruvdulkg`, queried read-only on 2026-09-24
(`pg_constraint`, `pg_policies`, `pg_proc`, row counts), and the repo
(`supabase/migrations`, `src/services/account`, `src/services/analytics`,
`supabase/functions/track-anonymous-usage-events`). The live
`delete_my_account()` matches the repo version in
`20260306000100_production_hardening.sql` exactly.

## How deletion runs

1. `deleteCurrentAccount()` (`src/services/account/accountService.ts`) lists
   and removes everything under `avatars/{uid}/` and
   `chapter-feedback-audio/{uid}/` with the user's own token. Storage RLS allows
   that (`avatar_delete`, `chapter_feedback_audio_delete_own`). If a removal
   fails, the account is not deleted, so the user can retry.
2. `rpc('delete_my_account')` runs `DELETE FROM auth.users WHERE id = auth.uid()`
   as a security-definer function. Supabase's auth tables (identities,
   sessions, refresh tokens, MFA) cascade from there, and `public.profiles`
   cascades from `auth.users`.
3. With the new migration, a `BEFORE DELETE` trigger on `profiles` clears the
   identity fields on kept feedback and deletes backup copies. Because it is a
   trigger, it also runs when an account is deleted from the dashboard or the
   admin API.
4. On the phone (`src/services/account/deleteAccount.ts`): sign out, delete the
   account's private-data buckets, and anonymise its queued analytics.

## Data map

"Deleted" means the row is removed. "Anonymised" means the row stays and the
user link is set to null. "Retained" means the row stays as it is.

| Where                                                                                                                                                                                                        | Link to user                         | On deletion                                | Notes                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.users`, identities, sessions, refresh tokens                                                                                                                                                           | —                                    | Deleted                                    | `auth.audit_log_entries` has 0 rows. The platform's auth logs are kept by Supabase for its own retention window.                                                       |
| `profiles` (email, display name, avatar URL, admin role)                                                                                                                                                     | `id` → `auth.users` CASCADE          | Deleted                                    |                                                                                                                                                                        |
| `user_progress`, `user_preferences` (includes feedback name and ID number), `user_translation_preferences`                                                                                                   | CASCADE                              | Deleted                                    |                                                                                                                                                                        |
| `user_annotations` (notes, highlights, bookmarks)                                                                                                                                                            | CASCADE                              | Deleted                                    |                                                                                                                                                                        |
| `user_reading_plan_progress`, `user_saved_plans`, `user_reading_plan_unenrollments`                                                                                                                          | CASCADE                              | Deleted                                    |                                                                                                                                                                        |
| `user_engagement_summary`                                                                                                                                                                                    | CASCADE                              | Deleted                                    | The nightly job rebuilds it only from events that have a user.                                                                                                         |
| `user_devices` (push tokens, device id)                                                                                                                                                                      | CASCADE                              | Deleted                                    |                                                                                                                                                                        |
| `private.group_join_attempts`                                                                                                                                                                                | CASCADE                              | Deleted                                    |                                                                                                                                                                        |
| `prayer_requests`, `prayer_interactions` written by the user                                                                                                                                                 | CASCADE                              | Deleted                                    |                                                                                                                                                                        |
| `group_members` rows for the user                                                                                                                                                                            | CASCADE                              | Deleted                                    |                                                                                                                                                                        |
| `groups` the user leads                                                                                                                                                                                      | `leader_id` CASCADE                  | **Deleted, with everything in it**         | Other members lose the group, its sessions, its plans, and their own prayer requests in it. Policy choice, see below.                                                  |
| `group_sessions` the user created                                                                                                                                                                            | `created_by` CASCADE                 | **Deleted**                                | A group loses a session record, with its notes, when the member who created it leaves the app. Policy choice.                                                          |
| `group_reading_plans` the user assigned                                                                                                                                                                      | `assigned_by`                        | **Was: blocked deletion. Now: anonymised** | Bug 1, fixed.                                                                                                                                                          |
| `analytics_events` (25.6k rows, 17.5k already anonymous)                                                                                                                                                     | `user_id` SET NULL                   | Anonymised                                 | The row keeps `session_id`, app version, platform, event properties and IP-derived city/region/lat-long. No property holds an id or email: the keys were checked live. |
| Analytics still queued on the phone                                                                                                                                                                          | `attribution_user_id`                | **Was: kept with uid. Now: anonymised**    | Bug 4, fixed.                                                                                                                                                          |
| `analytics_monthly_rollup`, `analytics_ingest_throttle`                                                                                                                                                      | none (aggregates; hashed client key) | Retained                                   | Not personal to an account.                                                                                                                                            |
| `chapter_feedback_submissions` (25 rows)                                                                                                                                                                     | `user_id` SET NULL                   | Anonymised: text kept                      | **Was:** name, ID number, IP hash and audio path kept. **Now:** cleared. Sentiment, comment, `participant_role`, category and council resolution stay. Bug 2, fixed.   |
| `chapter_feedback_submissions.scripture_council_fixed_by`                                                                                                                                                    | SET NULL                             | Anonymised                                 | Council member who resolved feedback.                                                                                                                                  |
| Storage `avatars/{uid}/…`                                                                                                                                                                                    | path prefix                          | Deleted (client, before the RPC)           |                                                                                                                                                                        |
| Storage `chapter-feedback-audio/{uid}/…`                                                                                                                                                                     | path prefix                          | Deleted (client, before the RPC)           | Three older recordings sit under a non-uid prefix from the time before sign-in was required. They belong to no account, so account deletion cannot find them.          |
| Storage `group-images/{group}/…`, `study-materials/{group}/…`                                                                                                                                                | group id                             | **Retained** when the group is deleted     | No objects exist today. Postgres cannot delete storage objects, so this needs code in the client or an edge function once groups ship.                                 |
| `backups.*` copies of per-user tables                                                                                                                                                                        | `user_id`, no FK                     | **Was: retained. Now: deleted**            | Bug 3, fixed. The tables should still be dropped once they are no longer needed.                                                                                       |
| `admin_audit_logs`                                                                                                                                                                                           | `actor_user_id` SET NULL             | Anonymised, **but `actor_email` kept**     | Admins only. Policy choice.                                                                                                                                            |
| `content_images.uploaded_by`, `verse_of_day_entries.created_by/updated_by`, `translation_sync_runs.triggered_by`, `translator_team_passcodes.created_by/revoked_by`, `translator_access_settings.updated_by` | SET NULL                             | Anonymised                                 | Admin content stays; the author link goes.                                                                                                                             |
| `translator_review_attempts`, `translator_shared_passcode_uses`                                                                                                                                              | none (IP hash only)                  | Retained                                   | Not linked to an account.                                                                                                                                              |
| On the phone: this account's notes, library, Gather, Four Fields buckets                                                                                                                                     | —                                    | Deleted                                    | Other accounts' buckets and guest data stay (sibling commit 728f1f40).                                                                                                 |
| On the phone: crash log                                                                                                                                                                                      | none                                 | Retained                                   | Holds no uid.                                                                                                                                                          |
| Sign in with Apple tokens at Apple                                                                                                                                                                           | —                                    | **Not revoked**                            | Apple requires this. See below.                                                                                                                                        |

## Choices for the owner

1. **Analytics: anonymise (current) or delete.** Today a deleted account's
   events stay without the user link, so installs, reading minutes and country
   totals do not drop when someone leaves. Both stores allow keeping data that
   no longer identifies the person. The remaining risk is that an anonymous row
   still has a `session_id` and an IP-derived location, which could be
   re-identified in a small region. The alternatives are to delete the events,
   or to also clear `session_id` and the geo columns on deletion. The in-app
   warning currently says deletion removes "all associated data". Either the
   copy or the behaviour should change so they match.
2. **Translator feedback: keep the text without the author (now the default)
   or delete it.** The migration keeps the comment and sentiment for the
   translation teams and removes name, ID number, IP hash and audio. Also
   decide whether `participant_role` (free text, e.g. "pastor") should be
   cleared as well.
3. **Groups led by the deleted user.** Today the whole group is deleted,
   including other members' prayer requests and session notes. The other
   option is to hand leadership to the longest-standing member (the
   `guard_group_leader_change` trigger already allows any member as leader) and
   delete the group only when nobody is left. A related choice: whether
   sessions a member created should survive them (make `created_by` SET NULL).
4. **Admin audit log email.** Keep `actor_email` for accountability (a
   legitimate security reason both stores accept), or clear it along with
   `actor_user_id`.
5. **Backup tables.** The trigger now removes deleted users from them, but
   they still hold live users' data. Drop them once the fixes they protected
   are confirmed.

## What the stores require

**Apple, App Store Review Guideline 5.1.1(v)**, and Apple's "Offering account
deletion in your app" page (fetched 2026-09-24):

- Apps that let people create an account must let them start deletion inside
  the app. Temporary deactivation is not enough.
- Delete the account record and the personal data tied to it, including
  content the user created. Data may be kept only where the law requires it,
  and the user must be told what is kept.
- If deletion is not immediate, tell the user how long it will take and
  confirm when it is done.
- **Apps that offer Sign in with Apple must revoke the user's tokens with the
  Sign in with Apple REST API (`/auth/revoke`) when the account is deleted.**
  EveryBible offers Apple sign-in and does not revoke tokens today. Supabase
  does not do this on its own. The fix needs the app's Apple client secret, and
  the authorization code or refresh token captured at sign-in, so it belongs in
  an edge function. This is the biggest open compliance gap, and it needs
  credentials, so it is not in this branch.

**Google Play, User Data policy: account deletion** (Play Console Help
13327111, fetched 2026-09-24):

- Provide an in-app path to delete the account and its data.
- Also provide a **web page where people can request deletion without the
  app**, and link it in the Data safety form. The privacy page
  (`apps/site/app/privacy/page.tsx`, "Retention and deletion") tells people
  to email support, which may be enough. A dedicated `/delete-account` page
  with the steps and what is kept is safer. Confirm the Data safety form
  links to it.
- Delete all user data tied to the account. Data kept for security, fraud
  prevention or regulatory compliance must be disclosed in the privacy policy
  and the Data safety form. Anonymised analytics and anonymous feedback text
  should be described there if they stay.

## Verification

- Client: `src/services/analytics/usageQueue.behavior.test.ts` (anonymising a
  deleted account's queued events) and `src/stores/privateDataDeviceReset.test.ts`
  (deleting account A anonymises A's queued events, keeps B's, and a rejected
  deletion keeps them attributed). Both failed before the fix.
- Server: the migration was run on PGlite (Postgres) against a minimal copy of
  the affected tables, triggers and check constraints. Before the migration,
  deleting a former leader who had assigned a plan failed with
  `violates foreign key constraint "group_reading_plans_assigned_by_fkey"`.
  After it, deletion succeeds, the plan stays with `assigned_by = null`, the
  feedback keeps its text with name, ID number, IP hash and audio cleared,
  another user's feedback is untouched, and only the deleted user's backup
  rows are removed. The migration has **not** been applied to the live
  database.
