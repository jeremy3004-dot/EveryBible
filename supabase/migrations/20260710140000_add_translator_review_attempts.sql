-- Phase 3 of the chapter-feedback revamp: back the translator passcode with brute-force
-- protection. The review edge function records failed passcode attempts here (keyed by a
-- hashed client IP) and locks out an IP after too many failures in a short window (S2).
-- Service-role only: RLS is enabled with no policies so anon/authenticated clients cannot
-- read or write it via PostgREST; the edge function uses the service role.

CREATE TABLE IF NOT EXISTS public.translator_review_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translator_review_attempts_ip_created
  ON public.translator_review_attempts (ip_hash, created_at DESC);

ALTER TABLE public.translator_review_attempts ENABLE ROW LEVEL SECURITY;
