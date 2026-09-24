-- Security advisor cleanup (2026-09-24): authenticated_security_definer_function_executable
-- for public.is_group_member(uuid) and public.is_group_leader(uuid).
-- docs/research/supabase-advisors-cleanup-2026-09-24.md
--
-- 20260923233220 made both helpers caller-only (they check (select auth.uid()), so the
-- membership oracle is gone), but they stayed in `public`. PostgREST therefore still publishes
-- them at /rest/v1/rpc/is_group_member and /rest/v1/rpc/is_group_leader as SECURITY DEFINER
-- entry points, which the advisor flags (WARN). The audit's L1 recommendation was to move them
-- to a non-exposed schema; this does that.
--
-- Why this is safe and needs no app change:
--   * Nothing calls them by name. Live check 2026-09-24: no function body in any schema
--     mentions them (pg_proc.prosrc), and src/, apps/, supabase/functions/ have no
--     rpc('is_group_member' | 'is_group_leader').
--   * Their only dependents are the 9 RLS policies on groups, group_members, group_sessions and
--     prayer_requests (pg_depend). A policy stores the function by OID, and ALTER FUNCTION ...
--     SET SCHEMA keeps the OID, so every policy keeps calling the same function. The policy
--     text shown by pg_policies changes from public.is_group_member(...) to
--     private.is_group_member(...); the semantics do not.
--   * Executing a function referenced by OID needs EXECUTE on the function, not USAGE on its
--     schema (schema USAGE is only checked at name lookup). EXECUTE for authenticated and
--     service_role is kept as granted in 20260923233220. `private` still grants nothing to
--     anon/authenticated, so clients cannot name the helpers directly.
--   * Both bodies are `set search_path = ''` and fully qualified (public.group_members,
--     public.groups), so they resolve the same from the new schema.
--   * The groups feature has not launched (0 rows in groups/group_members on 2026-09-24).
--
-- Verified with scripts/verify-group-policies-sql.mjs (PGlite): every group client flow and
-- every M4/L1/L5 assertion passes with this migration applied, as `authenticated` without
-- USAGE on `private`.
--
-- Idempotent: each move only runs while the function is still in public.

create schema if not exists private;
revoke all on schema private from public;

do $$
begin
  if to_regprocedure('public.is_group_member(uuid)') is not null
     and to_regprocedure('private.is_group_member(uuid)') is null then
    alter function public.is_group_member(uuid) set schema private;
  end if;

  if to_regprocedure('public.is_group_leader(uuid)') is not null
     and to_regprocedure('private.is_group_leader(uuid)') is null then
    alter function public.is_group_leader(uuid) set schema private;
  end if;
end
$$;

-- Restate the grants (unchanged from 20260923233220) so the end state does not depend on it.
revoke all on function private.is_group_member(uuid) from public, anon;
revoke all on function private.is_group_leader(uuid) from public, anon;
grant execute on function private.is_group_member(uuid) to authenticated, service_role;
grant execute on function private.is_group_leader(uuid) to authenticated, service_role;

-- Verification (run after applying):
--   select to_regprocedure('public.is_group_member(uuid)'),   -- null
--          to_regprocedure('private.is_group_member(uuid)');  -- not null
--   select count(*) from pg_policies
--    where qual ~ 'private\.is_group_(member|leader)' or with_check ~ 'private\.is_group_(member|leader)';
--   -- 9
--   select has_schema_privilege('authenticated', 'private', 'USAGE');  -- false
