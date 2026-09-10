-- S6 [Medium] — anonymous chapter-feedback rate limiting was keyed on attacker-controlled data.
--
-- submit-chapter-feedback (verify_jwt = false, so credential-free) scoped its 20-per-hour
-- flood guard for anonymous submitters on participant_name + participant_role — two free-text
-- fields taken straight from the request body. Changing either one resets the counter, so the
-- limit was trivially bypassable by rotating a name.
--
-- This migration adds the column the function needs to scope that guard on a stable,
-- un-spoofable identifier instead: a SHA-256 hex digest of the client IP, computed edge-side
-- from cf-connecting-ip (stamped by Supabase's Cloudflare proxy) with x-forwarded-for /
-- x-real-ip only as fallbacks. Same shape as translator_review_attempts.ip_hash, which the
-- review-chapter-feedback passcode lockout already uses.
--
-- Only the hash is stored, never the address: 64 hex chars, no reverse lookup, and it is
-- never returned to translators by review-chapter-feedback.
--
-- Nullable on purpose:
--   * every row written before this ships has no hash, and
--   * a request that arrives with no usable IP header still records feedback (the guard just
--     cannot scope it), which matters more than the guard for a feedback endpoint.
--
-- The partial index matches the anonymous rate query
-- (`.is('user_id', null).eq('client_ip_hash', h).gte('created_at', windowStart)`), which
-- always constrains client_ip_hash to a value, so the NULL legacy rows are excluded from the
-- index entirely. Mirrors idx_chapter_feedback_user_created_at from
-- 20260327190000_create_chapter_feedback_pipeline.sql:32.

ALTER TABLE public.chapter_feedback_submissions
  ADD COLUMN IF NOT EXISTS client_ip_hash TEXT NULL;

COMMENT ON COLUMN public.chapter_feedback_submissions.client_ip_hash IS
  'SHA-256 hex digest of the submitting client IP (cf-connecting-ip preferred). Used only to '
  'scope the anonymous submission rate limit (S6); never exposed to translator review.';

CREATE INDEX IF NOT EXISTS idx_chapter_feedback_client_ip_hash_created_at
  ON public.chapter_feedback_submissions (client_ip_hash, created_at DESC)
  WHERE client_ip_hash IS NOT NULL;
