# Chapter Feedback Ops

## Source of truth

`public.chapter_feedback_submissions` is the durable record. The former Google Sheets
export is retired. The mobile translator queue and existing admin `/feedback` page
read and update these same records.

## Participation and access

Settings owns the persistent active mode: reader, community, Scripture Council, or
translator. Community participation is open, including signed-out submissions.
Council and translator access are verified before changing modes. A failed,
cancelled, or offline attempt leaves the previous mode active. There are no role
controls in chapters. Closing the composer or changing modes preserves its current
draft while the reader remains mounted; sending successfully clears it.

Configure the separate `SCRIPTURE_COUNCIL_PASSCODE` secret on the server. Never put
any expected code in mobile public environment variables or tracked files. The app
stores entered access codes in SecureStore, with only the active mode in preference
storage. Sign-out and account-switch cleanup clear both credentials. Failed council
attempts share the existing attempt table under a separate hashed-IP namespace
(10 failures/15 minutes).
Both lockouts key on the edge-stamped `cf-connecting-ip` (then `x-real-ip`; IPv6 by /64),
never on `x-forwarded-for`, and refuse with 503 if the attempt counter is unavailable.

### Translator passcodes: one per team

Each translation team has its own passcode (owner decision 2026-09-24). A passcode
opens the review queue only for the translations its team covers; a request naming
any other translation gets 403 `translation_not_covered` before any feedback is read
or changed, and does not count as a wrong guess.

- Team passcodes live in `public.translator_team_passcodes` (service role only) as a
  per-row random salt plus salted SHA-256 hash, never in plaintext.
- Create, list, rotate, and revoke them at admin.everybible.app → **Translator Access**
  (`/translator-access`). Enter a team name and the translation IDs exactly as the app
  uses them (case-sensitive; the page lists the IDs that already have feedback). The
  six-digit code is shown once; give it to the team, then leave the page. A lost code
  cannot be recovered, only rotated. Every change is in the admin audit log.
- Codes are six digits because installed app builds have a keypad that stops at six.
  Brute force is limited by the per-client lockout (10 failures per 15 minutes). Rotate
  a team's code when someone leaves the team.
- Unlocking (`validateOnly`) succeeds for any valid code and now also returns the
  code's `translationIds` and, when the app sent one, `coversTranslation`. Current
  builds ignore these fields. A translator whose code does not cover the translation
  on screen can still unlock, but that translation's queue shows a load error until
  they switch to one their code covers.

The old shared `TRANSLATOR_REVIEW_PASSCODE` keeps working during the transition, but
only for the translations in `TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS`
(comma-separated). Unset, that defaults to `bsb`, the only translation with feedback
when team passcodes shipped. If a team code and the shared code are ever the same
digits, the team's narrower scope wins.

To retire the shared passcode:

1. Create a team passcode for every team that uses the shared one, and hand them out.
2. Run `supabase secrets set TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS=none`. The shared
   code now opens nothing and counts as a wrong guess, so anyone still using it hits
   the lockout after 10 tries. Secrets apply without a redeploy.
3. Once nobody reports problems, unset both secrets:

   ```bash
   supabase secrets unset TRANSLATOR_REVIEW_PASSCODE TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS
   ```

`submit-chapter-feedback` verifies the council code for each council submission.
`contributor_category` snapshots `community` or `scripture_council` at submission;
subsequent changes cannot relabel it. Older rows remain NULL, displayed as historical
attribution unavailable. A self-reported `participant_role` never verifies council
membership. Council attribution does not confer chapter approval or voting rights.

An explicit owner-requested correction on September 18 classified 16 historical BSB
submissions belonging to the verified Jeremy Curry account as Community. It preserved
all review outcomes and recordings; the immutability trigger remains enabled. This
was a scoped administrative data correction, not automatic attribution of other
historical submissions.

Participant name and project role remain required self-reported fields. Authentication
is optional; a valid session supplies `user_id`, otherwise it is NULL.
`participant_id_number` remains NULL for new submissions. Contributor history is
available only for the authenticated author's own records through existing RLS.

## Review and completion

A chapter shows one compact summary and a Review feedback entry. The dedicated
screen defaults to All / Needs review, with Council and Community filters and a
Reviewed view. Concerns sort before positive responses. Pages contain 40 records,
ordered by sentiment and immutable sequence, anchored to the first page's snapshot.
Refresh includes later arrivals. Counts aggregate in Postgres across the entire
chapter, independently of the loaded page or category filter.

Every individual feedback card always shows the contributor's rating, even when
there is a written comment or recording. Accurate responses have a full soft-green
card and checkmark; Needs work responses have a full soft-amber card and exclamation
mark. Existing translated rating labels and accessible light/dark theme colors are
used. Contributor category and processing status are separate neutral text. A
positive response can still need translator review; that does not make it negative.

Positive responses without a comment or recording form a compact group. Originals
remain accessible. Bulk review previews an exact set of up to 500 pending IDs, asks
for confirmation with that count, and updates only eligible IDs in that set. New
responses arriving after the preview remain pending. Repeat for larger groups.
Positive responses with a comment or recording stay individually reviewable.

- Positive response: **Mark reviewed**.
- Concern corrected: **Mark addressed**, with an explanation.
- Concern requiring no correction: **No change needed**, with a reason.
- Handled response: **Reopen**, clearing its outcome and explanation.

The compatibility columns remain `scripture_council_resolution` (`fixed` or
`no_change_needed`), `scripture_council_fixed_at`, `_fixed_by`, and `_fixed_note`.
A positive `no_change_needed` outcome displays Reviewed. A concern's `fixed` outcome
displays Addressed. New v2 clients require a reason for either concern outcome;
older client request contracts remain accepted. The existing admin address action
writes the resolution together with its required note and timestamp. History shows
the outcome and explanation. Book/chapter badges and queues use server outcomes,
not local audio-listening markers.

“All current feedback reviewed” means there are responses and none remain pending.
An empty chapter has its own empty state. New feedback restores pending status and
leaves prior outcomes intact. Neither sentiment nor completion indicates formal
accuracy approval.

## Recordings

Recordings stay in the private `chapter-feedback-audio` bucket, as M4A (`audio/mp4`),
up to one minute and 5 MB. Authenticated uploads use the existing user-scoped path;
anonymous uploads go through the submit function to an `anonymous/` path. Failed
uploads with invalid or incomplete MP4/M4A containers are rejected on the server
for both paths, regardless of their declared MIME type. The container check is
structural, not a full codec decode. Failed
submission preserves the draft for retry. Translator playback refreshes a scoped,
10-minute signed URL before loading audio, supports pause/resume, and restores the
iOS speaker playback mode after recording. Raw auth UUIDs are not exposed to the
passcode-based review API.

## Backend rollout

Team passcodes: apply `20260924014137_add_translator_team_passcodes.sql`, then deploy
`review-chapter-feedback`. No secret changes are needed for the shared code to keep
working for `bsb`. If the function is deployed before the migration, the shared code
still works and any other code gets 503 until the table exists. No app release is
needed.

Apply `20260917120000_feedback_participation_and_review.sql` before deploying the
updated submit and review functions, including their `_shared/councilAccess.ts`
dependency. It adds immutable attribution/sequence and service-role-only aggregate,
page, preview, and exact-ID review RPCs. Deploy the mobile client after the backend.
Existing records and audio objects are retained. Existing non-v2 review requests
keep their old response shape for installed clients.

## Verification

Run `npm run release:verify` and `deno check --no-config` for both changed functions.
`scripts/verify-chapter-feedback-local.ts` exercises a real isolated local backend,
including 320 mixed responses, pagination beyond 200, concurrent inserts, filtering,
forged council rejection, immutable attribution, outcomes/reopening, exact-ID bulk
review, private contributor history, audio, and new feedback after completion.

Provide `FEEDBACK_QA_STATUS_FILE` (local `supabase status -o json`),
`FEEDBACK_QA_TRANSLATOR_CODE`, `FEEDBACK_QA_COUNCIL_CODE`, optionally
`FEEDBACK_QA_AUDIO_FILE`, and a private `FEEDBACK_QA_CREDENTIALS_FILE` for simulator
login. Run with `node --import tsx scripts/verify-chapter-feedback-local.ts` on a
fresh isolated database. The script refuses remote hosts and retains labeled QA
fixtures for simulator checks. Never seed a live project with this fixture set.

The implementation checklist records the actual simulator/backend evidence and
any environment limitations. The older revamp plan is historical, not the current
participation or authentication contract.
