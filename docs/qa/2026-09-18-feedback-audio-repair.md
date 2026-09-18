# Chapter feedback audio repair — September 18, 2026

## Cause and scope

The new reviewer sends `apiVersion: 2, action: "audioUrl"`. Production review
function version 9 was still the September 11 source. It ignored that action and
returned the legacy feedback list with HTTP 200, without `playbackUrl`. The app
therefore reported audio unavailable. This affects the shared reviewer playback
path for historical, Community, and Scripture Council recordings.

The previous release report incorrectly called that backend deployment complete.
An ACTIVE function and version number alone did not establish source parity.

## Repair

- Production: EveryBible Supabase project `ganmududzdzpruvdulkg`.
- Deployed the already-tested review handler and `councilAccess.ts` dependency
  from `ce71ac2ac855de2790614341aacd48abfe07a7ab`.
- Live review version 10, updated `2026-09-18T10:08:03.685Z`, ACTIVE,
  `verify_jwt=false` with existing custom access validation preserved.
- Downloaded both live files and compared their bytes with the working copy and
  `git show ce71ac2a`. Handler SHA-256:
  `41c56379e72feefaaf5a0fc5c294786acb1e03dd875bfa31e4d16fa60583b841`.
- Submit version 4 already contained category/council support and was unchanged.
- No mobile source or binary change is needed for this server repair.

## Historical attribution correction

The user explicitly requested Community attribution for their older notes.
Backed up all 25 feedback rows locally, then applied
`correct_jeremy_curry_historical_community_attribution` in one transaction.
The operation required exactly one account associated with the full participant
name and exactly 16 eligible BSB submissions preceding the category rollout.
The attribution trigger was disabled only under a table lock for that update and
re-enabled before transaction completion.

Verified all 25 rows against the backup: exactly 16 category values changed from
NULL to `community`, with their update timestamps; every other field was identical.
The remaining nine rows were entirely unchanged. All eight account recordings
remain attached. Existing review states were preserved: Community attribution does
not mean that a pending note has been reviewed. Ambiguous anonymous records were
not attributed to this account.

## Verification

- All eight original recordings returned HTTP 200 with their exact stored sizes.
  FFprobe identified AAC audio; FFmpeg fully decoded all eight without errors.
- Executed the downloaded v9 handler with a synthetic local access credential
  against read-only production data: reproduced HTTP 200 with a feedback list
  instead of the requested playback URL.
- Executed the exact corrected handler with the same request: returned a signed
  URL and the original 134,269-byte Colossians 4 recording with HTTP 200. This
  handler-level check does not substitute for the actual protected live endpoint.
- Live council validation: correct code HTTP 200; wrong code HTTP 403.
- Focused review-service and council-access tests: 43 passed, zero failed.
- Submitted two fresh AAC notes through the real isolated local submit function,
  one Community and one Scripture Council. Both passed the read-only release
  check: correct category, v2 response, scoped refreshed URL, HTTP 200 and exact
  27,627-byte downloads. No production test submissions were created.
- iPhone 17 Pro Max / iOS 26.5, separate `com.everybible.feedbackqa` installation:
  opened Genesis 3, expanded each category's note, and tapped Listen. Both changed
  to Pause during playback and returned to Listen at completion. The actual native
  progress callbacks persisted `listenedAt` for both fixture IDs (10:16:57Z Council,
  10:17:24Z Community). This checks playback progress beyond a successful button tap.
  Local signed URLs use the documented Docker-to-loopback origin rewrite only.
- Full `npm run release:verify`: lint, workspace typechecks, 4,497 tests with zero
  failures, and Expo config passed. The new operational script also passed syntax,
  explicit ESLint and formatting checks.
- Actual protected production translator-request verification remains pending the
  user's existing translator credential. No production credential was guessed or
  changed. Live source parity, direct original-file downloads, exact-handler
  regression, live council validation and isolated simulator playback are verified.

Private row backups, original audio downloads, and diagnostic output are stored
outside the repository in the local temporary repair evidence directory. No
credentials, signed URLs, or private note contents belong in this document.

## Repeatable release check

After deployment, download the live function source and compare it with the exact
approved revision. Then run the read-only `scripts/verify-feedback-audio-live.mjs`
with the normal public API environment, `FEEDBACK_REVIEW_PASSCODE`, and
`FEEDBACK_AUDIO_CHECKS` containing known recording scopes and expected categories.
The check requires the v2 review response, correct attribution, a fresh playback
URL, a successful download, and matching byte count. It never prints credentials
or signed recording URLs. An old handler returning HTTP 200 is still a failure.
