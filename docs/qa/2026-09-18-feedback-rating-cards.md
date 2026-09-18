# Feedback rating cards

The reviewer previously used the positive label only when a response had no
comment. A positive Community submission saying “Good job” therefore displayed
only the note and Needs review, with the same styling as a concern.

Revision `adac656b` gives every individual response a persistent rating label and
full-card semantic background: green with a checkmark for Accurate; amber with an
exclamation mark for Needs work. Category and processing status use separate
neutral text. Ratings are unchanged by marking a response reviewed. Existing
translations and light/dark semantic theme tokens are reused.

## Verification

- Confirmed the real John 8 response is stored as `up` / `community` with comment
  “Good job”; no production feedback was changed during this UI fix.
- iPhone 17 Pro Max / iOS 26.5, isolated `com.everybible.feedbackqa` installation
  running current source through Metro: created local John 8 positive Community,
  negative Community, and positive Council fixtures.
- Verified the Accurate label remains visible alongside the written comment, and
  full-card color distinguishes sentiment for either contributor category.
- Inspected light and dark screenshots and the Community filter with both ratings.
- Expanded the positive Community card, marked it reviewed, and switched to Reviewed.
  It still displays Accurate, “Good job,” and the green card; the status alone changes.
- Full `npm run release:verify`: 4,501 tests passed, lint, workspace typechecks and
  Expo config passed. Evidence is in ignored `qa-evidence/feedback-rating-2026-09-18/`.
- iOS/Android build metadata aligned at 447. Only iOS TestFlight distribution is in scope.

## TestFlight delivery

- App source: `adac656b84eea8904312e148057cb47d119a8a2c`.
- Local Xcode archive/export, signed for `com.everybible.app`, version 1.0.9 (447).
- Packaged app passed the TestFlight precheck: embedded JavaScript, no Expo dev
  bundles, production Supabase endpoint, matching EAS release counter, valid signing.
- App Store Connect build: `8a085101-2a56-4933-9c3d-6b7c9531c1b1`, processing `VALID`.
- Internal Testers group `3a75b4d5-cae0-4c9a-8880-890f486f605a` includes this build;
  build beta detail independently reports `IN_BETA_TESTING`.

## CI test compatibility follow-up

The first GitHub run exposed existing Node 22 test-harness differences: a getter
mock was captured before enabling resumable downloads, a store assertion ran
before its download fake started, and retry clock advancement ended before async
module work completed. Test-only changes use a stable resumable factory, explicit
download-start promises, and bounded real I/O waits while advancing fake timers.
The three affected files pass all 161 tests on Node 22. No app runtime changes
were made after the TestFlight archive.
