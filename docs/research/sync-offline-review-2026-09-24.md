# Sync & offline data-safety review — 2026-09-24

Scope: every path by which signed-in user data moves between the device stores
(Zustand + MMKV) and Supabase — `src/services/sync/*`, `src/hooks/useSync.ts`,
`src/hooks/syncCoordinator.ts`, `src/stores/authStore.ts` + `authSessionState.ts`,
`src/services/plans/readingPlanService.ts` + `readingPlanModel.ts`,
`src/stores/readingPlansStore.ts`, `src/stores/progressStore.ts`,
`src/stores/annotationStore.ts` + `src/services/annotations/*`.
Baseline: `origin/main @ 7376d690`; file:line references are to that commit. Live schema was read (read-only) for
`user_progress`, `user_preferences`, `user_reading_plan_progress`.

Scenarios reasoned through: offline edits on two devices, clock skew, deletes vs
edits, sign-out during an in-flight sync, account switch, app kill mid-sync,
partial/failed upserts, network flapping, months-old local data, first sign-in
with guest data, and preference ordering in both directions.

## Findings (ranked)

| #   | Severity | Where                                                                                                          | Scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Impact                                                                                                                                                                                                                                                                          | Status                                                                                                                                              |
| --- | -------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Critical | `src/stores/authSessionState.ts:48`, `src/stores/authStore.ts:316,329`, `src/services/auth/authService.ts:393` | Signed-in reader opens the app **offline** more than an hour after the last token refresh (plane, rural data gap), or iOS cannot read the keychain yet. `supabase.auth.getSession()` cannot refresh, returns `session: null` (auth-js keeps the stored session because the error is retryable). `initialize()` routes that null through `setSession(null)`; `lastSyncedUserId` is still set, so the boundary treats it as a session expiry and resets **every** per-user store and the preferences. | All unsynced reading progress, streak, plan progress, Four Fields state and preferences are erased; `onboardingCompleted` flips to false so onboarding reopens while offline. When the network returns the same account refreshes and pulls, but anything read offline is gone. | Fixed (ad76bf6b)                                                                                                                                    |
| 2   | High     | `src/services/plans/readingPlanService.ts:411,990`, `readingPlanModel.ts:112`                                  | Any signed-in plan sync (every foreground/reconnect `syncAll`, every enrol/day-complete push). The server table has no `completed_sessions` / `current_session` columns, the payload omits them, and the echoed row is written back with `upsertProgress`, which **replaces** the local row.                                                                                                                                                                                                        | Multi-session plans (morning/midday/evening) lose every ticked session and their "next session" pointer on each sync.                                                                                                                                                           | Fixed (389a97c0)                                                                                                                                    |
| 3   | High     | `src/services/plans/readingPlanService.ts:392,973`                                                             | Two devices on one account, or a new device whose initial pull timed out (1.5 s, `:79`). `syncPlanProgress` and `pushProgressToRemote` upsert the local row without reading the server row first.                                                                                                                                                                                                                                                                                                   | Device A overwrites days completed on device B (server `completed_entries` replaced wholesale). A fresh enrolment on a second device wipes the account's existing progress for that plan. Heals only if device B syncs again; lost for good if B is gone.                       | Fixed (386a6ef1)                                                                                                                                    |
| 4   | High     | `src/services/plans/readingPlanService.ts:941` (snapshot from `syncService.ts:115`)                            | A day is completed while `syncAll`'s reading-plan branch is waiting on the network. The branch re-applies the snapshot it captured before the awaits, then pushes it and applies the echo.                                                                                                                                                                                                                                                                                                          | The completion made during the sync is reverted locally and never uploaded.                                                                                                                                                                                                     | Fixed (386a6ef1)                                                                                                                                    |
| 5   | Medium   | `src/services/plans/readingPlanService.ts:411,990`                                                             | User unenrols while an enrol/progress push is in flight. The echo is upserted into the store after the unenrol.                                                                                                                                                                                                                                                                                                                                                                                     | Plan re-appears as enrolled; after the tombstone's delete confirms, the resurrected local row is pushed again, so the unenrol is undone everywhere.                                                                                                                             | Fixed (389a97c0)                                                                                                                                    |
| 6   | Medium   | `src/services/sync/syncMerge.ts:262-289`, `syncService.ts:396`                                                 | Preferences edited on two devices between syncs (theme on the tablet, font size on the phone). Merge is whole-row last-writer-wins.                                                                                                                                                                                                                                                                                                                                                                 | One device's edit to a _different_ field is silently reverted on both devices. Also every sync re-upserted an unchanged row.                                                                                                                                                    | Fixed (ff73b81b; per-field once a device has a sync base)                                                                                           |
| 7   | Medium   | `src/services/sync/syncMerge.ts:274`, `syncService.ts:396`                                                     | Same field edited on two offline devices. `synced_at` is the _upload_ time, not the edit time, so an older edit uploaded later beats a newer one; device clock skew decides ties.                                                                                                                                                                                                                                                                                                                   | The newer choice for that one field can lose.                                                                                                                                                                                                                                   | Fixed client-side; needs migration `20260924120000` (per-field `field_updated_at`, not applied). `synced_at` still drives the "Synced N ago" label. |
| 8   | Medium   | `src/services/sync/syncMerge.ts:262-289`                                                                       | First sign-in on a device with guest preferences into an account that already has a client-written preference row. No sync base exists yet, so the whole-row stamp comparison still decides.                                                                                                                                                                                                                                                                                                        | A freshly onboarded device (newer stamp) pushes its untouched defaults over the account's font/theme.                                                                                                                                                                           | Fixed client-side on per-field stamps (defaults carry none); needs migrations `20260924120000` + `20260924120100` (backfill, not applied).          |
| 9   | Medium   | `src/services/plans/readingPlanService.ts` (delete path)                                                       | Device A unenrols (remote delete) while device B, which still has the plan, syncs later.                                                                                                                                                                                                                                                                                                                                                                                                            | B's next push re-creates the row; A's next pull re-enrols A.                                                                                                                                                                                                                    | Fixed client-side; needs migration `20260924120200` (tombstone table + triggers, not applied).                                                      |
| 10  | Medium   | `src/stores/annotationStore.ts:6,57`, `libraryStore.ts`, `gatherStore.ts`; not in `authStore.ts:74` reset list | Account switch or sign-out. Annotations (highlights, notes, bookmarks), library favourites/history and Gather state are device-scoped (`user_id: 'local-device'`), never synced and never reset.                                                                                                                                                                                                                                                                                                    | Account B sees A's private notes. Resetting them would delete the only copy, so this needs owner-tagging, not a wipe.                                                                                                                                                           | Deferred (product decision)                                                                                                                         |
| 11  | Low      | `src/services/sync/syncMerge.ts:81-127`                                                                        | Reader moves to a chapter that is not marked read (plan-mode reading, audio-only translation) and then a sync runs. Unread local position has timestamp 0, so the remote position wins.                                                                                                                                                                                                                                                                                                             | Reader position jumps back to the last _read_ chapter.                                                                                                                                                                                                                          | Deferred — needs a position timestamp in `bibleStore`.                                                                                              |
| 12  | Low      | `src/services/sync/syncService.ts:283-313` (and plans upsert)                                                  | Two devices sync `user_progress` at the same instant: both read R0, both write R0∪own.                                                                                                                                                                                                                                                                                                                                                                                                              | The first writer's new chapters vanish from the server until that device syncs again (local copy still has them).                                                                                                                                                               | Deferred — atomic server-side jsonb union RPC would close it.                                                                                       |
| 13  | Low      | `src/services/annotations/annotationMerge.ts:25`                                                               | Latent (no runtime caller of `syncAnnotations`): a deleted and a re-created annotation share a composite key; local seeding keeps whichever sorts last (the older, deleted one).                                                                                                                                                                                                                                                                                                                    | Would drop the re-created highlight if annotation sync is ever re-enabled.                                                                                                                                                                                                      | Noted                                                                                                                                               |

Things checked and found sound: the identity boundary (`syncIdentity.ts`) drops
every continuation after sign-out/account switch (uid + auth generation);
`syncOperationQueue` serialises per-account writes; the "skip unchanged progress
upsert" (`readingMatchesRemote`) compares content, not order, and the date column
round-trips as `YYYY-MM-DD`, matching `formatLocalDateKey`; chapter maps are
unioned with per-key max, so months-old local data and clock skew cannot drop a
chapter; plan tombstones persist across app kill and are retried before pushes;
a failed progress/preference upsert leaves the local stamp dirty for the next
cycle; guest → first account keeps guest progress and consumes only guest plan
tombstones.

## Fix notes

Each fix landed with its failing test in the same commit. After all fixes:
`npm test` 4745/4745 pass (baseline 4724), `npm run typecheck` and
`npm run lint` clean.

1. **Offline cold start.** `getCurrentSession` now reports `restoreFailed` when
   auth-js returns an `AuthRetryableFetchError` or storage throws. `initialize`
   skips the null-session boundary in that case, and the listener ignores the
   duplicate `INITIAL_SESSION` null. A real sign-out, a revoked refresh token,
   or a different account still reset as before; the same account's token
   refresh later resumes with local data intact.
2. **Plan echoes merge, never replace.** Server rows returned by an upsert are
   merged into the live row with `mergePlanProgress` (sessions unioned, day max),
   and are dropped if the plan is no longer enrolled or is tombstoned.
3. / 4. **Plan pushes read the server first.** `syncPlanProgress` and
   `pushProgressToRemote` fetch the account's rows, merge them into the live store,
   then push the _live_ merged rows. The stale snapshot is only merged (never
   overwrites), and a failed fetch skips the push instead of pushing blind.
4. **Preference three-way merge.** The store keeps `preferencesSyncBase` (the
   values the server held at the last reconcile). With a base, each field takes
   whichever side changed it; only a field changed on both sides falls back to
   the stamps. Unchanged rows are no longer re-upserted. Without a base (first
   sync on a device) behaviour is unchanged.

## Deferred server work (not applied)

- `user_reading_plan_progress.completed_sessions jsonb`, `current_session text`
  so session ticks follow the account across devices (today they stay local,
  now preserved rather than wiped). The client must not send them until the
  migration is live, or every plan upsert fails with 42703.
- ~~`deleted_at` tombstone on `user_reading_plan_progress` (finding 9).~~ Written as `20260924120200_reading_plan_unenroll_tombstones.sql` (a separate table; see below).
- ~~`edited_at` on `user_preferences` (finding 7).~~ Written as `20260924120000_user_preferences_field_edit_stamps.sql` (see "Server-backed follow-ups" below).
- Atomic merge RPCs for `user_progress.chapters_read` and plan
  `completed_entries` (finding 12).

## Server-backed follow-ups (2026-09-24, not applied)

The migrations below are written and verified in PGlite
(`scripts/verify-sync-contract-sql.mjs`) but NOT applied. **Apply them before
shipping an app build that contains these client changes.** The client degrades
if they are missing (it detects the absent columns/table and falls back to the
old behaviour), so a forgotten migration cannot break sync, only leave these
findings unfixed.

### Finding 7: newest edit wins per preference

`20260924120000_user_preferences_field_edit_stamps.sql` adds
`user_preferences.field_updated_at jsonb` (column name -> ISO edit time) and a
`BEFORE INSERT OR UPDATE` trigger. `setPreferences` stamps each field whose value
changed; the merge takes, per field, the value with the later stamp (the
server's on a tie), whichever device uploaded last.

- Installed builds do not send the column. On their upsert the column is left
  out of the `UPDATE`, which the trigger recognises: their values are accepted
  as before and every value they changed is stamped with the server time.
- New clients send stamps; the trigger refuses, per field, a value whose stamp
  is not newer than the stored one, so a read-merge-write race cannot let an
  older edit win. The upload reads the row back (`select().single()`) and adopts
  what the server kept.
- Clock skew: stamps later than the server's `now()` are clamped to `now()`; a
  device whose clock runs slow can still lose to an older edit (the server
  cannot know the real edit time).
- If the column is missing, the fetched row has no `field_updated_at` and the
  client uses the previous merge; an upload that names the column and gets
  PGRST204/42703 is retried without it.

### Finding 8: first sign-in keeps the device's real choices

A value with no stamp was never chosen: on the server it is the signup row's DB
default, on the device the app default. The per-field merge now lets any
stamped value beat an unstamped one, and between two unstamped values keeps the
device's, so a first sign-in neither imports `theme='dark'` from the signup row
nor pushes the device's untouched defaults over an account's real choices.

- `20260924120100_backfill_user_preferences_field_stamps.sql` stamps rows an app
  build has already written (every column gets that row's `synced_at`, the
  whole-row clock those builds merged on). Rows nobody wrote since signup keep no
  stamps; they are recognised by `synced_at = profiles.created_at`, which
  `handle_new_user` sets in one transaction (production 2026-09-24: 15 such rows,
  10 client-written). Idempotent; never overrides a trigger stamp.
- `authStore` persist version 4 seeds stamps for installs upgraded from version
  3, from the whole-row `preferencesUpdatedAt`: fields changed since the sync base
  when there is one; every field on a device that has synced an account (its old
  whole-row behaviour); only non-default fields on a guest device.

### Finding 9: leaving a plan on one phone stays left

`20260924120200_reading_plan_unenroll_tombstones.sql` adds
`user_reading_plan_unenrollments (user_id, plan_slug, unenrolled_at)` with
own-row RLS (select/insert/update only; clients cannot delete a tombstone) and
four triggers. The rule, enforced for every client: an enrolment whose
`started_at` is at or before the plan's `unenrolled_at` has ended.

- Writing a tombstone deletes the ended enrolment; any insert/update carrying
  an ended `started_at` is skipped (the BEFORE trigger returns NULL); a
  re-join (later `started_at`) is accepted.
- A separate table, not a column, because installed builds `select('*')`
  progress rows and would show a soft-deleted plan as enrolled.
- Installed builds still DELETE the progress row to unenrol; an AFTER DELETE
  trigger records that as a tombstone, so their leaves propagate too. Their
  stale re-pushes are skipped; `.single()` then reports no row, which they
  already swallow. Deletes cascaded from a deleted account are not recorded.
- New client: `unenrollPlan` records the leave time
  (`pendingUnenrollAtByPlanId`); the unenrol upserts the tombstone with it
  (a retried leave never ends a re-join made elsewhere meanwhile). Pulls and
  pre-push reads fetch the tombstones and drop local enrolments they ended
  (`endPlanLeftElsewhere`, no local tombstone). A snapshot row for a leave
  confirmed during the same sync is no longer pushed back.
- Clock skew: `started_at` and `unenrolled_at` are clamped to the server's
  `now()`. A device clock that runs slow by more than the gap between a leave
  and a re-join elsewhere can still misjudge that re-join.
- Missing table (PGRST205/42P01): the unenrol falls back to the old DELETE and
  tombstone reads are treated as empty.
