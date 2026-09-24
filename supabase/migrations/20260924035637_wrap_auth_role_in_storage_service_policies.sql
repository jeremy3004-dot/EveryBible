-- RLS performance cleanup (2026-09-24): per-row auth.role() calls in storage policies.
-- docs/research/supabase-advisors-cleanup-2026-09-24.md
--
-- The auth_rls_initplan pattern (auth.*() called bare in a policy, so Postgres re-evaluates it
-- for every row instead of once per statement as an InitPlan) no longer appears in any public
-- policy. A live pg_policies scan on 2026-09-24 found it only in these four storage.objects
-- policies (the advisor does not lint the storage schema):
--
--   "Service role upload for Bible audio"       INSERT  (20260322150000)
--     old WITH CHECK: ((bucket_id = 'bible-audio'::text) AND (auth.role() = 'service_role'::text))
--   "Service role delete for Bible audio"       DELETE  (20260322150000)
--     old USING:      ((bucket_id = 'bible-audio'::text) AND (auth.role() = 'service_role'::text))
--   "Service role upload for verse timestamps"  INSERT  (20260402220000)
--     old WITH CHECK: ((bucket_id = 'verse-timestamps'::text) AND (auth.role() = 'service_role'::text))
--   "Service role delete for verse timestamps"  DELETE  (20260402220000)
--     old USING:      ((bucket_id = 'verse-timestamps'::text) AND (auth.role() = 'service_role'::text))
--
-- Equivalence: auth.role() is STABLE and takes no arguments; it reads the request's JWT role
-- claim, which is fixed for the whole statement. `(select auth.role())` evaluates that same
-- call once per statement and yields the same value, so each expression returns the same
-- boolean for every row. Command, roles (public), permissiveness and bucket_id tests are
-- untouched; ALTER POLICY only replaces the expression.
--
-- Note, not changed here: these four policies never actually grant anything. Requests that
-- carry the service_role JWT run as the service_role database role, which has BYPASSRLS, and
-- every other caller's role claim is anon/authenticated. The upload scripts
-- (scripts/upload_timestamps.py, scripts/upload-bsb-audio-fast.py) use the service key. They
-- could be dropped with no behaviour change; that is left to the owner because it is a
-- policy-set change, not a performance fix.
--
-- Idempotent: each ALTER only runs if the policy exists; re-running rewrites the same text.
-- No app change needed.

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'Service role upload for Bible audio') then
    alter policy "Service role upload for Bible audio" on storage.objects
      with check (bucket_id = 'bible-audio' and (select auth.role()) = 'service_role');
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'Service role delete for Bible audio') then
    alter policy "Service role delete for Bible audio" on storage.objects
      using (bucket_id = 'bible-audio' and (select auth.role()) = 'service_role');
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'Service role upload for verse timestamps') then
    alter policy "Service role upload for verse timestamps" on storage.objects
      with check (bucket_id = 'verse-timestamps' and (select auth.role()) = 'service_role');
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'Service role delete for verse timestamps') then
    alter policy "Service role delete for verse timestamps" on storage.objects
      using (bucket_id = 'verse-timestamps' and (select auth.role()) = 'service_role');
  end if;
end
$$;

-- Verification (run after applying): returns 0 rows.
--   select policyname from pg_policies
--    where schemaname in ('public', 'storage', 'private')
--      and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.(uid|jwt|role)\(\)'
--      and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\.(uid|jwt|role)\(\)';
