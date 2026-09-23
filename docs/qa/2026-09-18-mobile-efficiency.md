# Mobile efficiency improvements — September 18, 2026

Scope: the approved background-audio, redundant-network, and optional-reporting
improvements. No artwork changes, dependency upgrades, backend changes, or release.
Implementation began at `63ba5cf9`; unrelated public-site work was preserved.

## Behavior

- Audio's 250 ms visual interpolation runs only while its reader hook is mounted
  and the app is active. Background/inactive/unmount stops that timer immediately.
  Foreground waits for a fresh native position before interpolating again, avoiding
  a jump based on elapsed background time. Native playback callbacks intentionally
  remain responsible for chapter advancement and coarse position updates after
  leaving the reader. Resume checkpoints, playback commands, telemetry, and sleep
  timers keep their existing behavior.
- Catalog callers share one in-flight refresh and a five-minute process-local
  freshness window. Only successful refreshes of every configured source count
  as fresh. Failure/partial success remains retryable; a changed Every Language
  catalog URL invalidates freshness. `refreshRuntimeCatalog({ force: true })`
  bypasses freshness while sharing any running request. Cache hits do not reapply
  old translation/download state. A new process still hydrates normally.
- Reading progress is merged as before, then compared with cloud content. Equal
  chapter timestamps, streak, last-read date, and reading position skip the
  `user_progress` upsert. Chapter-map key order and `synced_at` do not cause a write.
  New cloud rows, changed chapters/timestamps/streaks/positions, and concurrent
  reading changes retain the existing upload path and account-generation guards.
  Legacy NULL chapter maps retain the existing repair upload.
  Profile, preference, and reading-plan synchronization are unchanged.
- Optional analytics reporting requires an active app, positively connected
  network, reachability not explicitly false, and cost not explicitly expensive.
  Unknown connectivity defers reporting; unknown cost/reachability on a connected
  network does not. A deferred flush returns `{ success: true, deferred: true }`.
  Events remain in the existing persisted, bounded 500-event queue. No reporting
  retry timers or geo lookup start while denied. Native connection/app-state
  events resume a batch when suitable, without polling. An already-started upload
  can finish and acknowledge only its own batch. Deferred runtime effects own the
  listeners and cleanup. Foreground transitions invalidate cached connection
  state and wait for `NetInfo.refresh()`, since iOS can miss background network
  changes. Late refreshes cannot override newer events or a later lifecycle.
  Explicit playback/downloads and progress synchronization do not use this
  optional-reporting gate.

## Regression evidence

Tests exercised the production hook/services with native/network collaborators
replaced by deterministic fakes, without real accounts or phone hardware.

- Audio tests first reproduced visual position changes during background playback
  and after unmount; both now stop. Coverage includes foreground re-anchoring,
  replacement hook ownership, coarse resume position, next chapters, remote
  pause/play commands, and sleep expiry.
- Three fresh catalog requests previously ran three fetch sequences; now one.
  Concurrent requests also share one sequence. Expiry, force, URL change,
  failures, Every Language preservation, and download-state preservation pass.
- Three unchanged progress syncs previously made three `user_progress` writes;
  now zero. Cloud reads and necessary profile synchronization still happen.
  A fresh device still adopts cloud progress without writing identical data back.
  Changed timestamps, reset streaks, in-flight edits, and account isolation pass.
- Reporting tests cover startup unknown/offline/unreachable/expensive/background,
  persistence, no denied geo calls, repeated connectivity notifications, identity
  attribution, changes during geo/auth work, in-flight acknowledgments, listener
  cleanup/remount, and AppState callback ordering.

These are work/request-count improvements, not measured battery percentages or
physical-device speed claims. Native one-second playback snapshots remain; the
removed interpolation timer was configured for 240 additional ticks per minute.

## Verification

- `npm run release:verify` on Node 22: workspace lint and typechecks, **4,520
  tests passed**, zero failures/skips, and Expo configuration passed.
- Android production export passed, including Hermes bytecode and assets.
- Native iOS Release build passed; isolated simulator smoke is in progress.
- No physical-phone battery, carrier data, or hardware performance claim is made.

Detailed command logs are under `/tmp/everybible-optimization-*20260918.log`.
