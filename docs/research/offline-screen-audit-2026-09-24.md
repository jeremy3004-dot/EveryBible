# Offline screen audit — 2026-09-24

What each screen reachable from the tabs shows when the device is offline:
NetInfo reports no connection, and every Supabase call or `fetch` fails or hangs.
Baseline was `origin/main @ 9e1a3f25`. Method: code reading of each screen and
the hooks, services and stores it calls (four parallel read-only passes, one per
tab group), then render and behaviour tests for the fixes. Nothing here was
checked on a device; the "Needs device QA" list at the end covers that.

## Cross-cutting finding: a stalled request hung its spinner forever

`src/services/supabase/client.ts` built the client without a fetch timeout, and
React Native's fetch has none of its own: Android's OkHttp client is built with
0 (unlimited) connect and read timeouts. Airplane mode is not the dangerous
case, because the request fails at once and every screen below handles that
failure. The dangerous case is a link that is up with no internet behind it:
captive-portal Wi-Fi, a dead hotspot, or a 2G data gap. There the request can
stay pending forever, and so can any `loading`/`refreshing` flag waiting on it.
That affected My feedback, the translator queue, chapter feedback review, the
prayer wall (load, pull-to-refresh, post, report), synced groups (list, detail,
session save), profile avatar upload, sign-in and passcode checks.

**Fixed:** the client now aborts REST, auth and edge-function requests after
30 s (`requestTimeoutFetch.ts`). supabase-js turns the abort into its normal
`{ error }` result, which every one of those screens already handles. Storage
transfers and requests that pass their own `AbortSignal` are left alone.

## Screen table

| Screen                                   | Offline behaviour (before)                                                                                                                                                                                                                                                | Fixed?                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                                     | Renders from local data. The verse of the day comes from SQLite, and plans and progress come from MMKV. The audio-availability probe never blocks paint.                                                                                                                  | Fine                                                                                                                                                                                    |
| Bible reader                             | Chapter text comes from SQLite. Highlights and notes are on-device only. Audio load errors end in `status: 'error'`, never a stuck spinner. Chapter feedback submit showed "something unexpected happened", and the typed response was lost once the sheet or app closed. | **Yes.** A written response is saved to a per-account outbox and sent by the next sync, and the reader sees "Saved for later". A voice draft stays in the sheet with an offline notice. |
| Bible browser / search / chapter picker  | Search, book lists and navigation are local SQLite. The translator-only summary fetch clears its own loading flag.                                                                                                                                                        | Fine                                                                                                                                                                                    |
| Translation picker / Translation browser | Installed Bibles work. Downloads fail into a Cancel/Retry alert. The catalog refresh falls back to the persisted catalog, with no offline banner.                                                                                                                         | Fine (no banner; low)                                                                                                                                                                   |
| Chapter feedback review (translator)     | Server-only list. Offline it shows an empty error state; a hang would have spun.                                                                                                                                                                                          | Hang fixed by the timeout                                                                                                                                                               |
| Translator queue                         | Server-only. Offline it shows "Something went wrong" with Retry; a hang would have spun.                                                                                                                                                                                  | Hang fixed; wording not changed (low)                                                                                                                                                   |
| Plans home                               | Catalog is bundled, and progress hydration is `void`ed with a 1.5 s race, so pull-to-refresh always ends. Swipe-delete removed the row but showed an **Error** alert when the server delete could not be confirmed.                                                       | **Yes.** The leave is reported as pending sync, and its tombstone still retries.                                                                                                        |
| Plan detail                              | Loads from bundled data. **Leave plan** (signed in) removed the plan on the device, then showed "Error" and left the reader on the page of a plan they had already left.                                                                                                  | **Yes.** Same fix; the screen now goes back.                                                                                                                                            |
| Rhythm detail / composer                 | Local store only.                                                                                                                                                                                                                                                         | Fine                                                                                                                                                                                    |
| Gather home / foundation detail          | Bundled content plus the local Gather store.                                                                                                                                                                                                                              | Fine                                                                                                                                                                                    |
| Lesson detail                            | Passage text is local, and the loading state has a `finally`. **Play on streamed (not downloaded) audio did nothing**: the error was swallowed silently.                                                                                                                  | **Yes.** It now shows "You're offline. Connect to the internet and try again."                                                                                                          |
| Prayer wall                              | Load failure shows an error card with Retry, not an empty wall. Posts and interactions show alerts on failure, and optimistic toggles roll back. There is no queue (posts need the server's moderation). A hang would have spun.                                          | Hang fixed by the timeout                                                                                                                                                               |
| Group list / detail / session            | Local groups are fully offline. Synced groups show an error with Retry or Back. **A synced-group session completion is not queued**: the member gets an alert and must redo it online. A hang would have spun.                                                            | Hang fixed. Queueing deferred (see below).                                                                                                                                              |
| More / Settings                          | Renders local preferences. Preference sync is fire-and-forget. The passcode check fails into the generic error.                                                                                                                                                           | Fine                                                                                                                                                                                    |
| Profile                                  | Stats are local and the engagement card is skipped offline. A failed avatar upload shows an alert and reverts.                                                                                                                                                            | Fine                                                                                                                                                                                    |
| Reading activity / Annotations / Privacy | Local stores only.                                                                                                                                                                                                                                                        | Fine                                                                                                                                                                                    |
| Diagnostics / About                      | Local crash log and static content.                                                                                                                                                                                                                                       | Fine                                                                                                                                                                                    |
| My feedback                              | Server-only list, which showed "Something went wrong" offline.                                                                                                                                                                                                            | **Yes.** It says the reader is offline and keeps Retry.                                                                                                                                 |
| Auth / reset password                    | Network failures map to `auth.serviceUnavailable`; the form stays usable.                                                                                                                                                                                                 | Fine (sign-in needs the network by design)                                                                                                                                              |
| Onboarding (locale setup)                | The catalog hydration has its own timeout and one retry. It shows a retry card while the bundled Bibles stay selectable, and onboarding completes offline.                                                                                                                | Fine                                                                                                                                                                                    |

## What was fixed

Each fix landed with its failing test in the same commit:

1. `791fd9e6` **Supabase request timeout** (`requestTimeoutFetch.ts`, wired into `client.ts`).
2. `8391e4e0` **Leaving a plan offline.** `unenrollFromPlan` returns
   `{ success: true, pendingSync: true }` when the server cannot confirm the
   leave. The M12 tombstone retry is unchanged.
3. `5b1bd3ed` **Chapter feedback outbox** (`chapterFeedbackOutbox.ts`):
   - `submitChapterFeedback` marks network, timeout, 5xx and 429 failures `retryable`.
   - Retryable written submissions are queued per account in MMKV (at most 50,
     and dropped after 30 days).
   - `useSync.performSync` flushes the queue on every foreground and reconnect
     sync. The flush sends oldest first and stops at the first submission that
     still cannot get through. It drops submissions the server refused on
     their merits.
   - The council passcode is never persisted; it is read from SecureStore at
     send time.
   - Four new strings in all 21 locales.
4. **Offline wording** for My feedback and lesson audio (`utils/connectivity.ts`).

## Deferred (not fixed here)

- **Synced-group session completion offline** (`GroupSessionScreen.handleComplete`,
  `groupService.recordSyncedGroupSession`) is not queued. Queueing it needs
  server-side idempotency, because a session insert that is replayed would
  create a duplicate session.
- **Voice chapter feedback offline** is not queued. The recording is several
  MB of base64, and queueing it would need a file-backed outbox, not the
  shared MMKV file.
- **Offline wording** for the translator queue, chapter feedback review and
  the prayer wall. These still say "Something went wrong". They now
  terminate, and the prayer wall card already has a cloud-offline icon.
- The Translation browser has no offline banner; it silently shows the
  persisted catalog.

## Needs device QA

- Android on captive-portal Wi-Fi: My feedback and the prayer wall should end
  in their error state within about 30 s.
- Submit chapter feedback in airplane mode, reconnect, and bring the app to
  the foreground. The feedback should appear in My feedback.
- Leave a plan in airplane mode. The screen should go back, and the plan
  should stay gone after reconnecting.
