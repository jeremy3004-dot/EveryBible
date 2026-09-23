-- Security hardening (audit 2026-09-24, finding L3).
--
-- pg_net 0.19.5 functions (net.http_get/http_post/http_delete, worker_restart, ...) have a
-- NULL ACL, so every role, including anon and authenticated, holds EXECUTE through PUBLIC.
-- Supabase's grant_pg_net_access event trigger also granted USAGE on schema net to anon and
-- authenticated. The net schema is not exposed through PostgREST, so this is only reachable
-- through a future SQL-injection path or a SECURITY INVOKER function, but no client role has
-- any reason to make outbound HTTP requests from the database.
--
-- Who still needs pg_net after this migration:
--   postgres                 cron job `nightly-aggregate-engagement` (cron.job.username =
--                            postgres) calls net.http_post. Granted explicitly below, BEFORE
--                            PUBLIC is revoked, because postgres only had EXECUTE via PUBLIC.
--   service_role             server-side code.
--   supabase_functions_admin database webhooks (none today).
-- No other function or trigger in the database calls net.* (checked 2026-09-24).
--
-- OWNERSHIP CAVEAT: the net functions and schema are owned by supabase_admin, and postgres
-- is not a superuser. If this migration runs as postgres, Postgres may skip the GRANT and
-- REVOKE statements with a "no privileges were granted/revoked" WARNING instead of failing.
-- The block below re-checks the result and raises a WARNING naming what is still open. If
-- that warning appears, the same statements must be run by supabase_admin (Supabase support
-- ticket). The ordering is safe either way: the explicit grants are attempted first, so
-- postgres never loses EXECUTE while PUBLIC still holds it.
--
-- Regression check: supabase/tests/pg_net_client_access.sql

do $$
declare
  fn regprocedure;
  grantees text := 'postgres, service_role';
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_functions_admin') then
    grantees := grantees || ', supabase_functions_admin';
  end if;

  execute format('grant usage on schema net to %s', grantees);

  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net'
  loop
    execute format('grant execute on function %s to %s', fn, grantees);
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;

  revoke usage on schema net from anon, authenticated;

  if has_function_privilege('anon', 'net.http_post(text, jsonb, jsonb, jsonb, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'net.http_post(text, jsonb, jsonb, jsonb, integer)', 'EXECUTE')
     or has_schema_privilege('anon', 'net', 'USAGE')
     or has_schema_privilege('authenticated', 'net', 'USAGE') then
    raise warning 'pg_net is still callable by anon/authenticated: the migration role (%) could not change privileges on supabase_admin-owned objects. Re-run this migration as supabase_admin.', current_user;
  end if;
end;
$$;
