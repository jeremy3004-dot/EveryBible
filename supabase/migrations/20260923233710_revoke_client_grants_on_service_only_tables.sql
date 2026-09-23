-- Security hardening (audit 2026-09-24, finding L2).
--
-- These six tables have RLS enabled and no policies, so today anon and authenticated
-- cannot read or write a row. They still carried Supabase's default full table grants,
-- which means one stray permissive policy (for example `using (true)`) would expose them.
-- Only service-role code touches them:
--   admin_audit_logs, translation_sync_runs  -> apps/admin (service client)
--   translator_review_attempts               -> review/submit-chapter-feedback edge functions
--   analytics_monthly_rollup                 -> nightly cron as postgres
--   content_images, verse_of_day_entries     -> service-role content APIs
--
-- profiles has no DELETE policy. Account deletion cascades from auth.users inside the
-- SECURITY DEFINER delete_my_account(), so client roles need neither DELETE nor TRUNCATE
-- (TRUNCATE bypasses RLS entirely).
--
-- Regression check: supabase/tests/service_only_table_grants.sql

begin;

revoke all on table
  public.admin_audit_logs,
  public.analytics_monthly_rollup,
  public.content_images,
  public.translation_sync_runs,
  public.translator_review_attempts,
  public.verse_of_day_entries
from public, anon, authenticated;

grant all on table
  public.admin_audit_logs,
  public.analytics_monthly_rollup,
  public.content_images,
  public.translation_sync_runs,
  public.translator_review_attempts,
  public.verse_of_day_entries
to service_role;

revoke delete, truncate on table public.profiles from public, anon, authenticated;

commit;
