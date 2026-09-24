-- Passcode lockout race (security review 2026-09-24, pass 2, finding E1). Applied live 2026-09-24.
--
-- review-chapter-feedback and the Scripture Council gate read the failure count for a client
-- address once, then checked the passcode, and only recorded a failure afterwards. N parallel
-- requests from one address all read "fewer than 10 failures" before any failure row landed,
-- so each one got a real passcode check, and a correct guess answered 200 whatever the count
-- had become. One burst tested far more than the 10 codes per 15 minutes the lockout promises.
--
-- claim_passcode_attempt() takes the slot atomically BEFORE the passcode is evaluated: under a
-- per-address advisory lock it counts the failures in the window and, when under the
-- threshold, records this attempt as a failure and returns its id. The edge function
-- deletes that row only when the passcode matched (the table has only ever held failures). An
-- in-flight attempt therefore counts as a failure, so at most `p_threshold` evaluations can be
-- outstanding per window. It returns NULL when the address is locked out. Rows older than a
-- day are pruned opportunistically; nothing purged this table before.
--
-- The edge functions fall back to the previous read-then-record path only while this function
-- is missing (PostgREST PGRST202), so apply this migration BEFORE (or together with)
-- redeploying review-chapter-feedback and submit-chapter-feedback.
--
-- Rollback:
--   drop function if exists public.claim_passcode_attempt(text, integer, integer);

create or replace function public.claim_passcode_attempt(
  p_ip_hash text,
  p_threshold integer,
  p_window_seconds integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  if coalesce(p_ip_hash, '') = '' then
    raise exception 'p_ip_hash is required' using errcode = '22023';
  end if;

  -- The lock is held until this transaction commits, i.e. until the claim row below is
  -- visible, so the next caller for the same address counts it.
  perform pg_advisory_xact_lock(hashtextextended('claim_passcode_attempt:' || p_ip_hash, 0));

  if (
    select count(*)
    from public.translator_review_attempts attempts
    where attempts.ip_hash = p_ip_hash
      and attempts.succeeded = false
      and attempts.created_at >= now() - make_interval(secs => greatest(p_window_seconds, 1))
  ) >= greatest(p_threshold, 1) then
    return null;
  end if;

  insert into public.translator_review_attempts (ip_hash, succeeded)
  values (p_ip_hash, false)
  returning id into claimed_id;

  if random() < 0.01 then
    delete from public.translator_review_attempts stale
    where stale.created_at < now() - interval '1 day';
  end if;

  return claimed_id;
end;
$$;

revoke all on function public.claim_passcode_attempt(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_passcode_attempt(text, integer, integer) to service_role;

comment on function public.claim_passcode_attempt(text, integer, integer) is
  'Atomically reserves one passcode attempt for a hashed client address (recorded as a failure '
  'until the caller deletes it after a correct passcode). Returns NULL when the address is locked out. '
  'Service role only.';
