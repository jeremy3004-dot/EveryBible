# Translator review access: options (M2 follow-up, 2026-09-24)

Finding M2 in `supabase-security-audit-2026-09-24.md`: one shared `TRANSLATOR_REVIEW_PASSCODE`
opens `review-chapter-feedback` for every translation. Whoever holds it can read all
participant names, comments and recordings, and can mark any feedback resolved.

## Already fixed on this branch (no product decision needed)

| Change                    | Effect                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The lockout fails closed  | If the attempt counter cannot be read or written, the function returns 503 instead of checking the passcode without a limit.                                                                                                                                                                                                                                                                                               |
| Lockout key hardened      | Verified on the live project: Cloudflare rejects a client-sent `cf-connecting-ip` (403, error 1000) and overwrites `x-real-ip`. A client-sent `x-forwarded-for` reaches the function unchanged. The key now uses only the first two; without them, the caller goes into one shared bucket. IPv6 addresses are keyed by /64. This applies to the translator lockout, the council lockout and the anonymous submit throttle. |
| v2 list payload minimised | No per-row signed recording URLs. `participantRole` and `participantIdNumber` are returned as null. The current app shows none of these.                                                                                                                                                                                                                                                                                   |
| Shorter recording links   | The `audioUrl` link now lasts 10 minutes instead of 1 hour. Older (pre-v2) app builds keep their previous response.                                                                                                                                                                                                                                                                                                        |

Current data (read-only query): 25 submissions, all for one translation. 22 have a name, 18 a
comment, 11 a recording. The 14 non-null id numbers are all auth UUIDs, which the server
already hides. Leaking across translations is not happening yet. It becomes real once a second
translation team receives the passcode.

## Decisions for the owner

**Decided 2026-09-24:** option A, one passcode per translation team, stored hashed in
`public.translator_team_passcodes` and managed in the admin dashboard (not in a server
secret as sketched below). Contributor full names stay visible to translators. See
"Translator passcodes: one per team" in `docs/chapter-feedback-ops.md` for how it
works and how to retire the shared passcode.

### 1. How translators are identified

**A. One passcode per translation or team (recommended next step).** Add a server secret that
maps each code to the translations it covers, for example
`TRANSLATOR_REVIEW_PASSCODES={"<code>":["bsb"],"<code2>":["npi-x"]}`. The function would refuse
any `translationId` outside the code's scope. Keep the existing global code only until every
team has its own, then remove it.

- Needs no database change. Old app builds keep working as long as their code covers the
  translation they review.
- Settings already checks the code against the reader's current translation. The one UX gap:
  a translator who switches to a translation their code does not cover gets "access denied" in
  the review screen. That needs a clearer message, or a way to store more than one code.
- Revoking one team means rotating one code. There is still no per-person audit trail.

**B. Per-translator accounts (the audit's proper fix).** Add a
`reviewer_scopes (user_id, translation_id, granted_by, granted_at, revoked_at)` table. The
function would require a verified sign-in and filter by scope. An admin grants access in the
admin dashboard.

- Gives per-person revocation and a full audit trail: `scripture_council_fixed_by` is always
  set.
- Needs a migration, an admin screen for granting access, and app changes. Translators would
  have to sign in. Old builds, which send only a passcode, need a transition period in which
  both methods work.

**C. A now, B later.** A takes about a day of work. Move to B once there are more than a few
translation teams, or when an audit trail is required.

### 2. What translators should see about each contributor

The review card shows `participantName`. Comments and recordings are the substance of the
review, so they stay. Choose one:

- keep full self-reported names (current behaviour);
- show first name or initials only;
- show names only for Scripture Council contributors and label community contributors
  "Community reader".

The change is small and server-side, in `review-chapter-feedback/reviewPayload.ts`.

### 3. Global cap on failed attempts

Not implemented. A per-IP limit does not stop an attacker who controls many addresses. With
10 guesses per 15 minutes per IPv4 address, 1,000 addresses give about 960,000 guesses a day.
That is enough to break a 6-digit code within a day, but it does nothing against a random code
of 12 or more characters. A global cap (for example, 100 failures per 15 minutes across all
callers) limits guessing, but it also lets anyone lock every translator out by sending wrong
codes. It must block correct codes too, or a guesser learns which code is right.

- Recommendation: use long random codes and rotate the current one (as the audit also says).
  Add a global cap only if codes must stay short.

## Deployment notes

- Deploy `review-chapter-feedback` and `submit-chapter-feedback` together, because both
  include `_shared/passcodeAttempts.ts` and `_shared/councilAccess.ts`. Neither needs a
  migration. Attempt hashes keep their existing format, so open lockout windows carry over.
- After deploying, check that a wrong code returns 403 and the 10th wrong code within
  15 minutes returns 429. Check that the review screen still plays recordings, since it now
  depends only on the `audioUrl` action.
