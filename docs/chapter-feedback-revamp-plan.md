# Scripture Council → Translator Feedback: Revamp Plan

**Date:** 2026-07-10
**Status:** Approved for execution
**Scope:** Chapter feedback pipeline (council submission → translator review → resolution)
**Supabase project:** `ganmududzdzpruvdulkg` (EveryBible)

---

## Why this plan exists

The chapter-feedback pipeline is half-working in production. The **submission side works and is used**: 23 real submissions from 5 council participants across 14 BSB chapters (10 with audio), all stored and readable. The **resolution side has never closed the loop**: 0 of 23 items have ever been marked fixed in the database, because translator mark-offs are written only to device-local MMKV storage (`translatorReviewStore.feedbackMarkers`) and never sent to the server. The `scripture_council_fixed_at/by/note` columns exist but have no write path anywhere in this repo. Council members have no way to see that their feedback was handled. Several security gaps allow impersonation and brute-force access to council PII.

This plan fixes the loop, hardens security, and upgrades the translator workflow — in four independently-landable phases.

---

## Current architecture (verified live 2026-07-10)

```
Council member (mobile)
  Settings toggle chapter_feedback_enabled + name/role   [self-service, NO server enforcement]
  → BibleReaderScreen feedback modal / inline composer (sentiment + comment + ≤60s audio)
  → supabase.functions.invoke('submit-chapter-feedback')  [JWT optional — anonymous accepted]
  → inserts chapter_feedback_submissions (export_status hardcoded 'exported')
  → audio → private bucket chapter-feedback-audio (5MB cap)

Translator (mobile)
  Settings → 6-digit passcode → validated vs TRANSLATOR_REVIEW_PASSCODE secret  [no rate limit]
  → BibleBrowserScreen fetches summary (all rows, limit 5000) → pending/addressed badges
  → BibleReaderScreen fetches chapter items (limit 200, 1h signed audio URLs)
  → "Mark fixed" / "No action needed" / "Confirm accurate" / "Reopen"
      → writes ONLY to local MMKV markers. NO API call. Server never learns.   ← THE CORE FLAW

DB columns scripture_council_fixed_at/by/note: write-orphaned (docs reference an admin
web app at /feedback that is NOT in this repo; review function doesn't even SELECT them).
```

Live facts: both edge functions deployed & ACTIVE (`submit-chapter-feedback` v9, `review-chapter-feedback` v4, both `verify_jwt=false`); `chapter_feedback_submissions` has RLS enabled with **zero policies** (service-role only — intentional); all 5 feedback migrations applied; 8 indexes including partial "open items" index.

---

## Findings register

Severity-ranked. Phases below reference these IDs.

### Architecture / workflow
| ID | Sev | Finding | Where |
|----|-----|---------|-------|
| F1 | CRIT | Translator resolution is device-local MMKV only; no API write; lost on reinstall/second device; invisible to other translators, admins, council | `src/stores/translatorReviewStore.ts:35-103`, `BibleReaderScreen.tsx:3151-3174` |
| F2 | CRIT | `scripture_council_fixed_at/by/note` columns + 2 indexes have no write path in repo; review function never SELECTs them; badges can't reflect admin-side fixes | migration `20260522164000`, `supabase/functions/review-chapter-feedback/index.ts` |
| F3 | HIGH | Council member never learns feedback outcome — no "My feedback" view, no notification. Loop never closes for the submitter | (absent feature) |
| F4 | HIGH | No translator notification of new feedback; must open Bible browser and expand book accordions to spot badges; no queue screen, no counts | `BibleBrowserScreen.tsx:241-278` |
| F5 | MED | Multi-translator: shared passcode + local markers = no coordination; both see everything unresolved | same as F1 |
| F6 | MED | Summary badges stale — fetched only on browser mount; no useFocusEffect/pull-to-refresh | `BibleBrowserScreen.tsx:241-268` |
| F7 | MED | Feedback is chapter-scoped; no verse targeting (signal quality for translators) | schema + composer |
| F8 | LOW | No translation-version snapshot; pre-fix thumbs-down indistinguishable from post-fix | schema |

### Security
| ID | Sev | Finding | Where |
|----|-----|---------|-------|
| S1 | HIGH | Anyone can submit feedback with fabricated `participant_name`/`participant_role`; council membership never verified server-side; anonymous (no JWT) submissions accepted | `submit-chapter-feedback/index.ts:168-171,311-323` |
| S2 | HIGH | 6-digit passcode, no rate limiting, `validateOnly` gives a free validity oracle → brute-forceable → exposes ALL council PII, Supabase UUIDs, signed audio URLs | `review-chapter-feedback/index.ts:82-90` |
| S3 | HIGH | No rate limit on submit function — spam/flood risk incl. 5MB base64 audio bodies | `submit-chapter-feedback/index.ts` |
| S4 | MED | `participant_id_number` stores raw Supabase auth UUID and returns it to translators | `submit:358`, `review:211` |
| S5 | MED | CORS `*` on review function (returns PII) | `review-chapter-feedback/index.ts:3-4` |
| S6 | MED | `book_id` free-text, `chapter` unbounded above — dataset pollution | `submit:163-177` |
| S7 | LOW | Audio orphaned in storage if DB insert fails after upload (no cleanup) | `submit:333-374` |
| S8 | LOW | No duplicate-submission guard (same user can flood one chapter) | schema |

### Bugs / dead code
| ID | Sev | Finding | Where |
|----|-----|---------|-------|
| B1 | HIGH | `export_status` hardcoded `'exported'` in DB while response returns `exported:false`; `getChapterFeedbackResultVariant` 'submitted' branch unreachable; `chapterFeedbackSuccess` and `chapterFeedbackSavedFallback` have identical text | `submit:284,381`, `bibleReaderFeedbackModel.ts:22-36`, `en.ts:181-184` |
| B2 | HIGH | Signed audio URLs expire after 1h with no refresh; play silently fails in long review sessions (no error surfaced) | `review:186-194`, `BibleReaderScreen.tsx:3146-3181` |
| B3 | MED | `loadTranslatorFeedback` has no stale-response guard (browser summary fetch has one; reader doesn't) — rapid chapter navigation can render wrong chapter's feedback | `BibleReaderScreen.tsx:1466-1496` |
| B4 | MED | `markRead` store action + model read-tracking + i18n keys are fully dead code (never called) | `translatorReviewStore.ts:21,52-58`, `translatorFeedbackReviewModel.ts:96-109` |
| B5 | MED | Browser summary fetch has no loading or error UI — failures silently show no badges | `BibleBrowserScreen.tsx:252-262` |
| B6 | MED | `buildNormalizedIdentity` fallback can send partial identity (name without role), violating the service invariant | `chapterFeedbackService.ts:85-92` |
| B7 | LOW | "Listened" marker set at play-start, not completion | `BibleReaderScreen.tsx:3160-3180` |
| B8 | LOW | Audio state `'success'` set then immediately overwritten to `'idle'` — dead state | `BibleReaderScreen.tsx:3321,3401-3402` |
| B9 | LOW | Summary caps at 5000 rows / chapter at 200 rows, silently truncating; summary aggregates 5000 rows in JS instead of SQL GROUP BY | `review:117-131,124,173` |

### UI / design / i18n / a11y
| ID | Sev | Finding | Where |
|----|-----|---------|-------|
| U1 | HIGH | Since the ember-only "Illuminated" pass, `accentGreen === accentPrimary`, so selected thumbs-up and thumbs-down are the SAME ember color — sentiment distinction lost. `colors.success` (`#80c16f`) exists and should be used for positive states | `BibleReaderScreen.tsx:4575,5821`, `src/constants/colors.ts:16-17,35` |
| U2 | MED | Feedback modal sentiment buttons, Cancel, and Submit lack `accessibilityLabel`/`accessibilityRole` (inline composer has them); browser badges lack labels; translator action buttons lack roles | `BibleReaderScreen.tsx:5816,5854,5921,5937,4297-4374`, `BibleBrowserScreen.tsx:286-299` |
| U3 | MED | Translator-review strings mostly untranslated in ES/HI (English fallback); only NE complete besides EN | `es.ts:168-189`, `hi.ts:169-190` |
| U4 | LOW | Hardcoded English `'Fonts & Settings'` in chapter actions sheet | `BibleReaderScreen.tsx:5701` |
| U5 | LOW | Success alert titled `t('common.ok')` ("Ok" as a title); Alert-based success is heavy — prefer toast/inline confirmation; no 2000-char counter on comment field; no friendly offline error | `BibleReaderScreen.tsx:3404-3409` |
| U6 | LOW | Modal shows disabled Send with no explanation when identity unset (inline composer shows "Not set" pill) | `BibleReaderScreen.tsx` modal path |

---

## Locked design decisions

- **D1 — Server is the source of truth for resolution.** Mark-offs write to `chapter_feedback_submissions` via the review edge function. Local MMKV markers remain ONLY for per-device UX state (read/listened). This single change fixes F1, F2, F5 and unblocks F3.
- **D2 — Resolution model.** Add one nullable column `scripture_council_resolution TEXT CHECK (scripture_council_resolution IN ('fixed','no_change_needed'))`. A resolved row has `scripture_council_fixed_at` (timestamp), `scripture_council_fixed_by` (uuid, nullable for passcode-only translators), `scripture_council_fixed_note` (optional), and `scripture_council_resolution`. Reopen nulls all four. "Confirm accurate" on a thumbs-up and "No action needed" on a thumbs-down both store `'no_change_needed'`.
- **D3 — Keep the passcode gate, hardened.** Small trusted team; a full role system is not warranted yet. Add Postgres-backed attempt throttling + lockout. Do not migrate to per-user translator roles in this pass.
- **D4 — Enforce council membership server-side.** `submit-chapter-feedback` requires a valid JWT, verifies `user_preferences.chapter_feedback_enabled = true` via service role, and takes the participant identity from `user_preferences` (server data), not from the client payload. Remove the anonymous path.
- **D5 — Stay mobile-first.** No web admin in this pass. The queue screen + "My feedback" live in the app.
- **D6 — i18n discipline.** Reuse existing keys wherever possible (per project memory, new keys require translations in EVERY locale to pass `src/i18n/locales/coverage.test.ts`). When new keys are unavoidable, add them to all locale files in the same commit.
- **D7 — Additive migrations only.** The live table has real production rows. No destructive schema changes, no data rewrites. Since 0 rows were ever resolved server-side, no backfill is needed; bump `translatorReviewStore` persist version to 3 and drop only the local *resolution* markers (keep read/listened).

---

## Phase 1 — Server-backed resolution (closes the translator loop)

**Fixes: F1, F2, F5, F6, B3, B5. Highest priority; everything else builds on it.**

1. **Migration** (new file in `supabase/migrations/`): add `scripture_council_resolution` column per D2. Additive only.
2. **Edge function `review-chapter-feedback`:**
   - Add `action: 'resolve' | 'reopen'` request mode: `{ passcode, feedbackId, action, resolution?, note? }`. Resolve sets `fixed_at=now()`, `resolution`, optional `note`, and `fixed_by` when a valid JWT accompanies the request (accept `Authorization` header optionally for attribution). Reopen nulls all resolution fields. Validate `feedbackId` exists and belongs to the requested translation.
   - Include `scripture_council_fixed_at`, `scripture_council_resolution`, `scripture_council_fixed_note` in BOTH the chapter query and summary query responses.
   - Summary response should return per-chapter `{ total, unresolvedDown, unresolvedUp }` counts computed from server state.
3. **Client service** (`chapterFeedbackReviewService.ts`): add `resolveTranslatorFeedbackOnServer(...)` and `reopenTranslatorFeedbackOnServer(...)` calling the new action; typed responses.
4. **Store refactor** (`translatorReviewStore.ts`): `feedbackMarkers` keep ONLY `readAt`/`listenedAt`. Resolution state now comes from fetched server data. Persist version 3 with migration dropping stored `resolvedAs`/`resolvedAt`.
5. **Reader UI** (`BibleReaderScreen.tsx` translator card): mark-off buttons call the server, optimistic update with rollback + error toast on failure. Show resolution badge from server fields. Reopen supported.
6. **Model** (`translatorFeedbackReviewModel.ts`): pending/addressed derives from server resolution, merged with local read/listened for the UX affordances.
7. **Browser badges** (`BibleBrowserScreen.tsx`): compute from server summary counts (not local markers); add `useFocusEffect` refresh (F6); add loading indicator + error state with retry (B5).
8. **Race guard**: request-ID guard in `loadTranslatorFeedback` mirroring the browser's existing pattern (B3).
9. **Tests**: behavioral tests for the new service methods (stub invoke), model derivation from server fields, store v3 migration. Update the source-text tests that assert on the old function/source strings — convert to behavioral where cheap.

**Acceptance:** resolving an item on device A, then fetching on device B, shows it resolved. `select count(*) filter (where scripture_council_fixed_at is not null) from chapter_feedback_submissions;` increases when marking fixed in the app. Badges reflect server state after focus-return. All existing tests updated and green.

## Phase 2 — Council member visibility ("My feedback")

**Fixes: F3 (the product-loop gap).**

1. **RLS policy migration**: `CREATE POLICY` allowing authenticated users to `SELECT` only their own rows (`user_id = (select auth.uid())`) on `chapter_feedback_submissions`. This is the first policy on the table — confirm it does not open anything beyond select-own (INSERT/UPDATE/DELETE remain denied).
2. **"My feedback" screen** (MoreStack, entry row near the chapter-feedback settings): lists the user's submissions (book/chapter, sentiment, comment/audio indicator, date) with status chips: *Received* (unresolved), *Fixed*, *Reviewed — no change needed* (from resolution fields). Direct PostgREST query via the service layer (no new edge function needed). Empty state + offline-friendly error state.
3. **i18n**: all locales (D6). **Navigation types** updated properly.

**Acceptance:** a council member sees their submission history with correct statuses that update after a translator resolves items. Users see only their own rows (verify with a second account).

## Phase 3 — Security & correctness hardening

**Fixes: S1–S8, B1, B6.**

1. **Submit function**: require valid JWT (401 otherwise — client already has the unused `chapterFeedbackSignInRequired` key; wire it in the composer before submit). Server-verify `chapter_feedback_enabled` and read `chapter_feedback_name/role` from `user_preferences`; ignore client-supplied identity fields (S1). Validate `book_id` against the canonical 66-book list and `chapter` against per-book chapter counts (S6 — book data exists in `src/constants/books.ts`; embed a compact map in the function). On DB insert failure after audio upload, delete the uploaded object (S7). Add per-user submission throttle (e.g. max 20/hour via a count query) (S3, S8).
2. **Review function**: add attempt throttling — small `translator_review_attempts` table (or reuse an existing rate-limit pattern) keyed by IP/device hash with lockout after N failures in a window; applies to `validateOnly` too (S2). Stop returning the raw Supabase UUID: omit `participantIdNumber` when it equals `user_id`, or truncate to a short display ID (S4). Keep CORS permissive only for the submit function; review can stay `*` ONLY if the passcode throttle lands, otherwise restrict (S5).
3. **Export semantics** (B1): insert is the terminal step today — keep `export_status='exported'` in the DB but return `exported: true`; collapse `getChapterFeedbackResultVariant` to submitted/failed and merge the duplicate success strings into one key (remove `chapterFeedbackSavedFallback` from ALL locales).
4. **Identity invariant** (B6): make `buildNormalizedIdentity` delegate strictly to `normalizeChapterFeedbackIdentity` (both fields required or null).
5. **Tests**: update the source-text tests that pin old behaviors (`export_status: 'exported'`, JWT-gate assertions) deliberately; add behavioral tests for the new validation paths.
6. **Redeploy both functions** after changes and verify with a real request.

**Acceptance:** anonymous submit returns 401; fabricated identity is ignored (server identity stored); 10 rapid wrong passcodes trigger lockout; a valid submit still succeeds end-to-end on device.

## Phase 4 — Translator UX upgrade + polish

**Fixes: F4, B2, B4, B7, B8, B9 (partial), U1–U6.**

1. **Translator Review Queue screen** (BibleStack): entry from a Bible browser header button (visible only when translator mode is on) and a Settings row. Lists chapters with unresolved feedback, sorted thumbs-down-first then recency, showing counts (`unresolvedDown`/`unresolvedUp` from Phase 1 summary). Tap → navigates to that chapter in the reader. Include a total-pending count. Pull-to-refresh.
2. **Signed URL refresh** (B2): when play is tapped and the URL is stale/fails, re-fetch that chapter's feedback to get fresh URLs, then play; surface playback errors via toast instead of silent failure.
3. **Listened threshold** (B7): mark listened at ≥60% of `durationMs` using playback status updates.
4. **Dead code** (B4, B8): wire `markRead` (mark items read when their card is fully visible / expanded) OR remove the action, model fields, and the dead i18n keys in every locale. Remove the unreachable `'success'` audio state. Remove `chapterFeedbackSavedFallback` (done in Phase 3).
5. **Sentiment color** (U1): use `colors.success` for selected thumbs-up state in both the modal and inline composer; keep ember for thumbs-down. Verify contrast in light + dark themes.
6. **Accessibility** (U2): `accessibilityLabel` + `accessibilityRole="button"` on modal sentiment buttons, Cancel/Submit, translator action buttons; labels on browser badges (e.g. "3 items need review").
7. **Copy & affordances** (U5, U6): success confirmation as inline state or toast instead of `Alert.alert(t('common.ok'), ...)`; add `{length}/2000` counter to comment inputs; friendly offline message on network failure; in the modal, when identity is unset show a hint + link to Settings instead of a silently disabled button.
8. **i18n** (U3, U4): add the `'Fonts & Settings'` key; complete translator-review + all new keys in EVERY locale file (coverage test enforces this).
9. **Summary efficiency** (B9, partial): move summary aggregation into SQL (GROUP BY with counts) now that Phase 1 changed the response shape; keep the 5000 cap but log/flag truncation in the response (`truncated: true`) and surface a notice in the queue screen.

**Acceptance:** a translator can go from app-open to the highest-priority chapter in ≤2 taps from the Bible tab; audio plays reliably in long sessions; VoiceOver announces all feedback controls; `npm run lint && npm run typecheck && npm test` green including locale coverage.

---

## Explicitly OUT of scope (recommended follow-ups, do not build now)

- Verse-level feedback targeting (schema + long-press flag + jump-to-verse) — highest-value follow-up, plan separately.
- Push notifications (new feedback → translators; resolution → council member) — `send-group-notification` function + `user_devices` infra exist for a later pass.
- Translation content-version hash on submissions (F8).
- Cursor pagination beyond the capped limits (B9 full fix).
- In-repo web admin replacing the out-of-repo `/feedback` tool.
- Offline queue for resolutions (resolve requires network; error + retry is acceptable for now).

---

## Execution instructions (for the implementing agent)

- Work in a fresh git worktree off up-to-date `origin/main`. This machine runs a concurrent agent fleet that pushes to `origin/main` mid-session — `git fetch` and verify before landing.
- Follow the repo bugfix protocol: for each bug fix, write/adjust the failing test first where feasible.
- Migrations: additive only (D7). Apply to the live project (`supabase db push` or Supabase MCP `apply_migration` on project `ganmududzdzpruvdulkg`) at the START of the phase that needs them. Run the security advisors after DDL changes.
- Edge functions: after editing, deploy (`supabase functions deploy submit-chapter-feedback` / `review-chapter-feedback` — `verify_jwt=false` stays, config in `supabase/config.toml`) and verify each with a live invocation before marking the phase done.
- The `TRANSLATOR_REVIEW_PASSCODE` secret already exists; never print or commit it.
- Existing source-text tests (regex over file contents) WILL break when you refactor the files they pin — update them intentionally; prefer converting to behavioral tests where the injection seams already exist.
- Every user-facing string: `t()` keys present in ALL locale files in the same commit (coverage.test.ts enforces).
- Theming: only `useTheme()` colors; no hardcoded hex.
- Verification gate per phase: `npm run lint && npm run typecheck && npm test`, plus the phase's acceptance checks above. Full `npm run release:verify` before final landing.
- Land each phase as its own commit (or small commit series); merge to `main` and push when all phases pass. Do NOT run any EAS/TestFlight build — code + backend only unless the user separately asks to ship.
