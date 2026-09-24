-- Chapter-feedback submission rate-limit race (security review 2026-09-24, pass 2, finding E3).
-- Applied live 2026-09-24.
--
-- submit-chapter-feedback runs with verify_jwt = false. Its 20-per-hour limit (per user, or per
-- hashed client address for anonymous callers) was a COUNT over chapter_feedback_submissions,
-- and the row was inserted later in a separate request, after an optional 5 MB audio upload.
-- N parallel requests all read "under 20" before any row landed, so one address could store
-- far more than 20 submissions and recordings an hour.
--
-- consume_feedback_submission_budget() charges one request against a fixed one-hour window in
-- a single atomic upsert on the existing UNLOGGED analytics_ingest_throttle table (the same
-- pattern as consume_app_error_ingest_budget), before the upload. Keys are limited to the
-- 'feedback-submit:' prefix so this function can never reset or read an analytics budget.
-- The edge function keeps its row count as a second check, and skips this budget only while the
-- function is missing (PGRST202), so apply this migration before (or with) redeploying
-- submit-chapter-feedback.
--
-- Rollback:
--   drop function if exists public.consume_feedback_submission_budget(text, integer, integer);
--   delete from public.analytics_ingest_throttle where client_key like 'feedback-submit:%';

create or replace function public.consume_feedback_submission_budget(
  p_client_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_row public.analytics_ingest_throttle;
begin
  if p_client_key is null or p_client_key not like 'feedback-submit:%' then
    raise exception 'client key must start with feedback-submit:' using errcode = '22023';
  end if;

  insert into public.analytics_ingest_throttle as t (client_key, window_started_at, request_count)
  values (p_client_key, now(), 1)
  on conflict (client_key) do update set
    window_started_at = case when t.window_started_at <= now() - v_window
      then now() else t.window_started_at end,
    request_count = case when t.window_started_at <= now() - v_window
      then 1 else t.request_count + 1 end
  returning * into v_row;

  allowed := v_row.request_count <= greatest(p_max_requests, 0);
  retry_after_seconds := case when allowed then 0 else greatest(
    1, ceil(extract(epoch from (v_row.window_started_at + v_window - now())))::integer
  ) end;
  return next;
end;
$$;

revoke all on function public.consume_feedback_submission_budget(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_feedback_submission_budget(text, integer, integer)
  to service_role;

comment on function public.consume_feedback_submission_budget(text, integer, integer) is
  'Atomically charges one chapter-feedback submission against a fixed window for a '
  'feedback-submit:* key (user id or hashed client address). Service role only.';
