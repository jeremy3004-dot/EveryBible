# Chapter feedback implementation and verification

Approved scope: settings-only participation (reader, community, council, translator),
server-verified council attribution, scalable chapter review, clear outcomes, and
contributor follow-up. Council participation does not confer chapter approval.

## Work slices

- [x] Persist one exclusive participation mode; preserve legacy preferences and drafts.
- [x] Verify council access on the server and snapshot contributor category.
- [x] Add complete summaries, stable pagination, and exact-set positive bulk review.
- [x] Add compact chapter entry and dedicated review screen; align history/admin.
- [x] Add regression coverage and run the full relevant verification gate.
- [x] Exercise at least 300 isolated responses on iPhone 17 Pro Max; inspect evidence.
- [x] Hand verified source and backend requirements to the deployment task.
- [x] Save intended changes to local main and verify TestFlight group distribution.

The initial deployment task was archived to stop overlapping implementation. A fresh
project-scoped deployment task completed the verified backend and TestFlight release.
Unrelated website/atlas working-tree changes are outside this implementation.

## Evidence

- `npm run release:verify`: passed lint, all workspace type checks, Expo config, and 4,496 tests.
- `deno check --no-config` for submit/review functions: passed.
- Real local Supabase integration: all 11 grouped checks passed, with 320 seeded mixed
  responses plus scoped submission, concurrency, history, and audio fixtures.
- Local project `EveryBibleFeedbackQA`, API port 55321, no linked production project.
  Historical migration replay required pg_cron setup and omitting one malformed,
  superseded analytics function from the local copy only. Production migration files
  were not changed. Docker's internal audio URL origin was rewritten to the host
  loopback origin in the local function copy only for simulator playback.
- iPhone 17 Pro Max, iOS 26.5, UDID B6292617-B431-4AC5-92BA-2A9FF5D35715.
  A separate `com.everybible.feedbackqa` installation reuses the existing compatible
  native development binary and runs this checkout's current JS through Metro 8093.
  The existing EveryBible installation and data were preserved.
- Simulator verified: open Community participation; wrong council code rejection;
  cancellation both before validation and while a correct validation was delayed;
  successful council access; full process restart with mode/credential retention;
  anonymous council text submission; microphone permission, recording, re-record,
  preview invocation, and successful 11,397 ms / 189,677 byte council audio upload.
  No claim is made about recorded speech intelligibility on the simulator.
- Simulator found and prompted fixes for incorrect Settings labels, the identity
  form keyboard layout, and late validation activation after cancellation.
- Simulator review used 329 Genesis 1 submissions. Verified Settings mutual exclusion;
  an unsent draft survived Council -> Translator -> Community; the subsequent submission
  was saved as Community while earlier Council attribution remained unchanged.
- Verified category/status filters, grouped positives and original responses, exact-set
  bulk confirmation, required explanations, Mark addressed, No change needed, Reopen,
  individual positive Mark reviewed, and audio playback/pause/resume. Scrolled through
  multiple network pages to QA Reader 002 beyond the previous 200-response boundary.
- Genesis 2 reached zero pending on both screens. A later real submission restored
  one pending response while the three previous outcomes remained unchanged.
- Inspected light/dark layouts and the decision form with the keyboard visible.
- Durable local evidence: `qa-evidence/chapter-feedback-2026-09-17/` (ignored by Git),
  including `chapter-summary.png`, `review-list.png`, `draft-community.png`,
  `oldest-pagination.png`, `chapter-complete.png`, `new-arrival.png`,
  `retained-outcomes.png`, `review-dark.png`, and the full verification logs.


- Signed into the isolated test account through the real UI. My feedback showed only
  its own submission, Addressed status, and the saved explanation; see `own-history.png`.
  Cross-account visibility was separately denied in the real backend integration test.

## Production deployment evidence

- Feature source revision: `7272e37bd8e6471431def78877bb2720fa5c2c23`.
- Production Supabase target: project `ganmududzdzpruvdulkg` (EveryBible). Only the
  checked-in `20260917120000_feedback_participation_and_review.sql` was applied;
  the connector recorded that exact migration under remote ledger version
  `20260918043624` because the historical production ledger is not identical to
  the local migration history. Existing feedback row count remained 25.
- Production backend verification: `submit-chapter-feedback` is ACTIVE version 4
  and `review-chapter-feedback` is ACTIVE version 9; both retain `verify_jwt=false`.
  The council passcode secret was configured without recording its value, and the
  existing translator passcode was unchanged. Wrong council access was rejected,
  correct `validateOnly` access succeeded, and no production feedback fixture or
  mutation was created.
- Local main now records iOS version `1.0.9`, build `446`, and the matching legacy
  distribution certificate/profile pair needed by the remote EAS credentials.
- IPA provenance: Xcode archive `EveryBible 2026-09-18 00.14.31.xcarchive`, then
  explicit manual export using the matching profile UUID and certificate SHA-1.
  `bash scripts/testflight_precheck.sh` passed for build `446`; the IPA contains
  the embedded JS bundle, no Expo dev bundles, and a valid code signature. IPA
  SHA-256: `4dbc13c25bdd1b3ea396da289d7c3c9ec11d1e27fe0e8ad3aba41373d789a4b2`.
- App Store Connect: build `446` / version `1.0.9`, build ID
  `364d52ac-77e7-439b-b263-9fbdf7e3660f`, processing state `VALID`. It is attached
  to the existing `Internal Testers` group (`3a75b4d5-cae0-4c9a-8880-890f486f605a`),
  and the intended internal tester relationship was read back successfully.
- No website or admin deployment was performed.

## Final local-main verification

- iOS and Android tracked build metadata are aligned at 446; only iOS was distributed.
- The post-release full suite exposed a pre-existing date-dependent fixture that seeded
  duplicate verse 1 rows on September 18. The test now freezes both September 17 and 18
  and seeds unique verse numbers. This changes tests only, not the distributed app.
- Final `npm run release:verify`: lint, workspace typechecks, Expo config, and all
  4,497 tests passed. Log: `qa-evidence/chapter-feedback-2026-09-17/final-release-verify.log`.
- All 14 unrelated tracked website/atlas WIP files remain byte-for-byte unchanged.
