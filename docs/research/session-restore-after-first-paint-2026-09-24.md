# Restoring the session after first paint — September 24, 2026

Question left over from the startup performance pass
(`app-performance-pass-2026-09-24.md`, "Not deferred, and why"): can the Supabase
session restore move after first paint without signed-in readers briefly seeing
signed-out screens, signed-out readers briefly seeing signed-in screens, or
token-dependent work running before the session is known?

**Decision: not implemented.** The design below holds for the data layer, and its
store-level invariants can be tested. The places a flash would appear are screens,
though, and this test suite has no component renderer, so the "no flash" guarantee
cannot be proven by tests. One case also cannot be made flash-free at all: a
refresh token the server rejects. Part of the win can be had safely, and the
investigation found a pre-existing offline cold-start delay worth fixing on its own.
See "Recommended next steps".

Baseline: `origin/main` at `195717e1`. Nothing was run on a device. The restore
trace below ran the app's installed `@supabase/supabase-js` 2.101.1 in Node with
a fake SecureStore and a scripted `fetch`, so it shows what runs and in what
order, not phone timings.

## What runs before first paint

`LoadingScreen` renders an empty boot shell until `isReady` (App.tsx:338).
`isReady` flips when `startupCoordinator.initializeCritical()` settles
(App.tsx:245–251), or after `STARTUP_READY_TIMEOUT_MS` = 6 s.

`initializeCritical()` (startupService.ts) runs:

1. **Privacy init.** It is awaited first and is not part of this question.
2. **`createAuthInitializer`:**
   - `useAuthStore.persist.rehydrate()` does synchronous MMKV work: one
     `JSON.parse` of `auth-storage` and `sanitizePersistedAuthState`. The store
     already hydrated once when it was created, so this parse runs twice.
     It costs little.
   - `authStore.initialize()` (authStore.ts:478):
     - It lazy-requires `services/supabase` and `services/auth/authSession`.
       The perf pass counted 44 modules and 1.03 MB of unminified JS, all
       evaluated synchronously on the JS thread.
     - The first `supabase.auth` access goes through the Proxy and builds the
       client. The `GoTrueClient` constructor starts `initialize()`, which calls
       `_recoverAndRefresh()`.
     - It awaits `getCurrentSession()`, which calls `supabase.auth.getSession()`.
       That waits for the client's initialize, then takes the auth lock and
       calls `__loadSession()`.
     - `setSession(...)` then reconciles the account boundary and switches the
       private-data owner. This is synchronous MMKV work.
     - It subscribes `onAuthStateChange`. Only after that does it set
       `isInitialized: true`.

The auth step has a 4 s cap (`DEFAULT_CRITICAL_TASK_TIMEOUT_MS`,
startupService.ts:18). When it times out, the app paints and the restore keeps
running in the background.

### The trace, per launch case

The awaited native hops and network calls inside `getSession()`:

| Case at launch                                       | SecureStore reads | Network                                           | Result                                                 | Auth events                      |
| ---------------------------------------------------- | ----------------: | ------------------------------------------------- | ------------------------------------------------------ | -------------------------------- |
| No stored session (signed out)                       |                 4 | none                                              | `null`                                                 | INITIAL_SESSION                  |
| Stored session, access token still fresh             |                 4 | none                                              | session                                                | SIGNED_IN, INITIAL_SESSION       |
| Stored session, token expired, online                |       4 + 1 write | **1 refresh** (`/token?grant_type=refresh_token`) | session                                                | TOKEN_REFRESHED, INITIAL_SESSION |
| Stored session, token expired, **offline**           |                 5 | **16 refresh attempts over 50.8 s**               | `null` + `AuthRetryableFetchError`, so `restoreFailed` | INITIAL_SESSION                  |
| Stored session, token expired, refresh token revoked |     5 + 6 removes | 1 refresh (400)                                   | `null`                                                 | SIGNED_OUT ×2, INITIAL_SESSION   |

`jwt_expiry = 3600` (supabase/config.toml). auth-js treats a token as expired
90 s early (`EXPIRY_MARGIN_MS`). Anyone who has not opened the app in the last
hour therefore takes the "token expired" row. For a daily Bible reader, that is
nearly every cold start: **a signed-in reader's first paint waits on one auth
network round trip**, plus the synchronous evaluation of supabase-js. A
signed-out reader pays only the module evaluation and the SecureStore reads.

### Findings

1. **Offline cold starts are held for the full 4 s timeout.** auth-js retries a
   failed refresh with backoff (200 ms, 400 ms, … until 30 s would be exceeded).
   `_recoverAndRefresh` and `__loadSession` each run a full retry chain, so
   `getSession()` takes about 50 s to report the failure. The critical-task
   timeout releases first paint at 4 s. So a signed-in reader with an expired
   token, launching offline, stares at a blank shell for about 4 s on every such
   launch. The app is meant to be offline-first. The reader then sees guest UI
   for the whole session, because a `restoreFailed` restore never calls
   `setSession`. The `onAuthStateChange` subscription is not registered until
   `getSession()` returns, about 50 s later.
2. **The flashes this change would introduce already happen after the 4 s
   timeout.** On a slow network where the refresh takes longer than 4 s, the app
   paints guest UI. When the refresh then succeeds, `setSession(A)` flips it to
   signed in: a signed-out flash for a signed-in reader. If the refresh is
   rejected, `setSession(null)` resets preferences, including
   `onboardingCompleted`, and the tree swaps from Home to onboarding. A new
   design has to beat this behaviour, not zero.
3. **Cold-start analytics sessions are probably attributed as anonymous.**
   `useAppSessionAnalytics` starts from `AppContent` on mount (App.tsx:421), in
   parallel with `initializeCritical`. It reads `isAuthenticated` once, when its
   lazy import resolves, and that is almost certainly before the restore's native
   and network hops finish. A signed-in reader's first foreground session would
   then be logged on the anonymous path. Not confirmed on a device. The fix is
   test-first and independent of this decision: start the session once
   `isInitialized` is true.
4. **The per-account data layer is already optimistic.** `privateDataScope`
   shows the persisted owner's bucket before any restore, and a `restoreFailed`
   launch is deliberately not treated as a boundary. The per-user stores
   (progress, bible, plans) hold `lastSyncedUserId`'s data from hydration on. The
   only pessimistic part is identity: `user`, `session` and `isAuthenticated`
   are forced to `null`/`false` on hydrate (`sanitizePersistedAuthState`) and
   stay that way until the restore.

## Design

### State

- Persist `lastKnownIdentity: { uid, displayName } | null` in `auth-storage`.
  It holds no secrets: the uid is already persisted as `lastSyncedUserId`, and
  a display name is no more sensitive than `chapterFeedbackName`, which is
  already stored there. It is only honoured when `uid === lastSyncedUserId`.
  - It is written by `setSession`/`setUser` whenever there is a user.
  - It is cleared on every definitive sign-out (`setSession(null)` or
    `setUser(null)` down the reset path).
  - In `signOut()`, it is cleared **before** `supabase.auth.signOut()`. A kill
    between clearing SecureStore and the MMKV write then cannot leave a stale
    name behind. If sign-out fails after the clear, the next launch simply
    waits for the restore, which is today's behaviour.
- Add `sessionRestore: 'pending' | 'verified' | 'unverified'`. `unverified`
  means `restoreFailed`: offline, or a locked keychain.
- Add `selectDisplayIdentity(state)`, which returns `state.user` when there is
  one. Otherwise it returns `lastKnownIdentity` while `sessionRestore !==
'verified'`, and `null` in every other case. Showing the cached identity while
  `unverified` matches `privateDataScope`: an offline launch is not a sign-out.
  It also fixes finding 1's "guest UI all session".
- **`user`, `session`, `isAuthenticated` and `authGeneration` keep their exact
  current meaning.** They stay null until a real session is restored. This is
  what guarantees that no token-dependent work runs early. Every such caller
  gates on them:

| Caller                                         | Gate today                                       | Before restore under this design |
| ---------------------------------------------- | ------------------------------------------------ | -------------------------------- |
| `useSync` (via AppRuntimeEffects)              | `isInitialized && isAuthenticated && user.uid`   | no-op                            |
| `usePushTokenRegistration`                     | `isAuthenticated && userId`, generation re-check | no-op                            |
| `notificationService.registerPushToken`        | uid + generation                                 | not reached                      |
| `chapterFeedbackService` submit                | uid + generation + `session.access_token`        | no identity, no token            |
| `syncService`                                  | `user.uid` + live `supabase.auth` uid            | not reached                      |
| `readingPlanService` remote writes             | `user.uid`                                       | guest path (local only)          |
| `usageQueue` attribution                       | `user.uid`                                       | anonymous                        |
| Profile, My feedback, Reading activity fetches | `isAuthenticated` effect                         | re-run on flip                   |

Putting the snapshot into `user` itself would make every uid-only caller in
this table act for an account with no token. It would also keep the snapshot's
`authGeneration` valid after the restore. It was rejected for that reason.

### Startup gating

- Paint without waiting for auth **only** on a returning, onboarded launch whose
  snapshot is complete (`lastKnownIdentity.uid === lastSyncedUserId`). The
  restore then runs in the background, and the auth lock orders it before any
  supabase-js data call.
- Every other launch waits for the restore, as today:
  - **Signed-out readers** (`lastSyncedUserId === null`) wait, so they cannot
    flash signed in. The wait costs them no network (row 1 of the trace),
    only module evaluation and the SecureStore reads.
  - **The first launch after upgrading** waits too: no snapshot exists yet.
  - **Onboarding** keeps its current ordering, because sign-in can happen
    inside it.
- The restore's outcome then settles:
  - **Verified A, snapshot A.** Nothing visible changes. The display name may
    update from server metadata.
  - **Unverified.** The cached identity stays, and the data stays, as today.
  - **Definitive `null`** (refresh token revoked or reused, keychain lost after
    an Android backup restore). This is the **correction**: the existing reset
    runs, preferences return to defaults, and the tree swaps from Home to
    onboarding. It is what happens today for the same cause mid-session, or
    after the 4 s timeout.
  - **Verified B, snapshot A** (should not happen). The same reset path.

### Screens that must learn a third state

Every surface that shows identity, or a sign-in prompt, needs to read
`selectDisplayIdentity` and the restore status instead of `isAuthenticated`
alone. Otherwise a signed-in reader who opens it during a slow restore sees
guest UI:

- HomeScreen greeting (HomeScreen.tsx:297). This one is on first paint.
- More header and sign-in/out row (MoreScreen.tsx:82–83, 309).
- ProfileScreen, SettingsScreen and MyFeedbackScreen sign-in prompts.
- Group list, detail and session screens, PrayerWall, and the chapter feedback
  entry point.
- `useAppSessionAnalytics`, which should wait for the restore (finding 3).

## Why it was not implemented

The brief's three guarantees, checked against this design:

| Guarantee                                 | Provable by tests?                                                                                                                                                                                         | Holds?                                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No token-dependent call before restore    | **Yes.** Store-level: `user`/`session`/`isAuthenticated` stay null while `pending`; the gates in `useSync` and `usePushTokenRegistration` have behaviour tests; the feedback submit gate would need one.   | Yes                                                                                                                                          |
| No signed-in flash for signed-out readers | Partly. The store rule ("wait unless there is a complete snapshot"; clear the snapshot before sign-out) is testable.                                                                                       | Yes for readers who signed out on this device. **No** for a server-revoked refresh token or a lost keychain: they see Home, then onboarding. |
| No signed-out flash for signed-in readers | **No.** The selector is testable, but the flash lives in about 10 screens. The suite has no component renderer, and `docs/testing.md` rules out the source-text checks that would be the only alternative. | Only if every screen above is converted and checked on a device                                                                              |

The revoked-token correction is not a clean one. It resets preferences (theme,
language, `onboardingCompleted`) and swaps the whole tree. That is existing
behaviour, but moving it after first paint makes it visible. Anything the
reader did during that window is also reset. Making it clean ("You've been
signed out" in place, without leaving Home) is a product decision about the
reset policy, not a startup change.

## Recommended next steps

1. **Measure on a device first.** Add release-safe `[EB-T] auth:restore-start`
   and `auth:restore-done <outcome>` sentinels around `initialize()`, next to
   `App:module-start`. Extend `scripts/android_startup_metrics.py` to report the
   restore's share of `homeInteractionReadyMs`, for the fresh-token and
   expired-token cases, on a low-end Android phone and on iOS release. If the
   online refresh is a small share, the full design is not worth its risk.
2. **Fix the offline 4 s hold (finding 1) on its own.** This is the clearest
   user-facing cost, and it can be fixed without an identity cache. When the
   restore's first refresh attempt fails with a retryable error, treat the
   launch as `unverified` and release first paint. This does not change today's
   result: the reader already ends up on guest UI with their data. Two ways to
   detect the failure:
   - Race `getSession()` against an "unverified" signal from a wrapped
     `fetch`/storage adapter.
   - Check NetInfo up front.

   The fix should also register `onAuthStateChange` before awaiting
   `getSession()`, so a refresh that succeeds when the network returns updates
   the store immediately instead of after the ~50 s retry chains. Test-first
   with the Supabase fake: a retryable refresh failure resolves `initialize()`
   without `setSession`, and the subscription exists.

3. **Fix analytics attribution (finding 3).** Test-first in
   `useAppSessionAnalytics.test.ts`: a session that starts before
   `isInitialized` waits for it.
4. **Only then consider the full design.** First get a product decision on the
   revoked-session correction. Convert the screens listed above behind one
   `useAuthDisplayState()` hook, and add device QA for:
   - a slow network (Network Link Conditioner, 3G)
   - airplane mode
   - revoking the session from the Supabase dashboard
   - signing out and killing the app mid-sign-out.

   Store-level tests to write with it:
   - the snapshot is written on restore and cleared before sign-out
   - identity is withheld during `pending` and `unverified`
   - the gating rule for when paint may skip auth
   - the analytics wait.

## How this was measured

A throwaway Node script, not committed, built the real supabase-js 2.101.1
client from the app's `node_modules`. It used the same auth options as
`services/supabase/client.ts` (SecureStore-style async storage,
`autoRefreshToken`, `persistSession`, `detectSessionInUrl: false`), with an
in-memory storage that logged every access and a `fetch` scripted to succeed,
throw `TypeError('Network request failed')`, or return a 400
`refresh_token_not_found`. For each case it awaited `getSession()` once, the
same call `authSession.getCurrentSession()` makes. Node timings are JIT timings
and are not shown except the offline total (50.8 s), which is set by auth-js's
backoff sleeps, not by CPU. The module counts come from the perf pass.
