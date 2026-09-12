# Mobile maintenance — September 12, 2026

This local maintenance pass fixes reader and playback bugs, reduces repeated reader work, and makes the behavioral tests reliable on the CI Node version. It changes no dependencies, database schema, or release metadata.

## Reader

- Highlight recoloring, range changes, deletion, selection changes of the same size, and font/theme changes invalidate the memoized paragraph correctly. Both reader layouts share the appearance signature.
- Chapter highlights are indexed by verse once per annotation or chapter change. Repeated verse lookups no longer filter the complete annotation list. The deterministic probe indexes 100 annotations once and performs 1,760 subsequent lookups with zero further annotation range reads. This measures reduced work, not device latency.
- Selected verse ranges are memoized so audio updates do not repeatedly recompute annotation selection.
- Reference search retains the requested verse until native paragraph measurements arrive, then scrolls once. Changing the focus within the same chapter preserves its measurements; changing translation or chapter resets them. Audio follow-along retains its separate pending scroll path.

## Audio and connectivity

- Pause and Stop invalidate pending chapter and background-music loads, including commands waiting for native audio setup. Late loads dispose their own sounds instead of stopping the newer chapter.
- Delayed play, pause, stop, resume, remote fallback, and native status/error callbacks cannot overwrite a newer request. Resume checks ownership after restoring the saved position.
- Background music cancels pending crossfades when paused, restores the outgoing loop callback after cancellation, and remains retryable after a failed play.
- The sleep timer expires once through the normal Pause path, including when a chapter is buffering. Store status, background music, and command cancellation stay consistent.
- Native errors reported through callbacks cannot be overwritten by a subsequent resolved promise marking the player as playing. Healthy remote fallback remains available for a failed downloaded copy.
- Query connectivity respects an explicitly unreachable internet connection and initializes focus from the current app state when listeners are installed late.
- Exact audio coverage is keyed by catalog host as well as translation, version, and manifest URL; changing hosts cannot reuse the previous host's coverage.

## Test reliability

The Node 22 run exposed existing tests that assumed lazy imports finished within a fixed number of microtask/event-loop turns. Manifest, checksum, privacy, sync, and Bible-store tests now await observable fixture events or the relevant loader work. The sync rejection fixture creates its rejected promise when called, so it does not generate an artificial unhandled rejection before the service can catch it.

## Verification and limits

- Baseline: 4,418 workspace tests passed before changes.
- Added 50 behavioral regression/performance cases. `npm run release:verify` passed on Node 22.23.2: 4,468 tests, zero failures/cancellations/skips, workspace lint, mobile/admin/site typechecks, and Expo configuration validation. Log: `/tmp/everybible-maintenance-final-gate-reviewed.log`.
- Production iOS and Android Hermes bundles and assets exported successfully to `/tmp/everybible-maintenance-export`.
- A freshly built and signed iOS Debug simulator app ran the current workspace through Metro on port 8083. Verified Home, reading, creating/recoloring/removing a test highlight, playback controls, paused next-chapter navigation, reference search, and full-text search for “peace.” The test highlight was removed.
- Reference-search screenshots before and after: `/tmp/everybible-reference-search.png` and `/tmp/everybible-reference-search-fixed.png`. Highlight evidence: `/tmp/everybible-highlight-yellow.png`, `/tmp/everybible-highlight-blue.png`, and `/tmp/everybible-highlight-removed.png`.
- A separate standalone native Release build exhausted available disk space. Its generated intermediates and partial Release products were removed, recovering about 3.7 GiB. The successful signed Debug app was preserved. No standalone Release install, physical Android interaction, App Store, or TestFlight distribution is claimed.
- The existing admin custom-font lint warning remains. Repository-wide Prettier checking already failed before this pass; two existing reader line layouts were retained because an existing source-contract test depends on them. New files and the other touched source/test files follow Prettier.
- The 14 originally modified tracked website/document/script files were checked against their starting SHA-256 hashes and preserved byte-for-byte. Their work is excluded from these maintenance commits.
- Three parallel agents reviewed audio correctness, reader correctness/performance, and test reliability. Review found and resolved a delayed Stop silencing a newer background-music session and a competing pending audio scroll after reference search. The test reviewer repeated the affected 120-test Node 22 suite three times and verified the 162-test Bible-store suite.

The work is saved locally. No merge, push, or deployment is part of this pass.
