-- Audit 2026-09-24 L3: client roles must not be able to issue HTTP requests through pg_net.
-- Run against a local or linked database as postgres (read-only assertions).
-- Before 20260924150100_revoke_client_execute_on_pg_net.sql this fails: every net.*
-- function had a NULL ACL (implicit PUBLIC EXECUTE) and anon/authenticated had USAGE on net.
BEGIN;

DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(format('%s:%s', r.role_name, p.oid::regprocedure), ', ')
  INTO offenders
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS r(role_name)
  WHERE n.nspname = 'net'
    AND p.proname IN ('http_get', 'http_post', 'http_delete')
    AND has_function_privilege(r.role_name, p.oid, 'EXECUTE');

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Client roles can still execute pg_net requests: %', offenders;
  END IF;

  IF has_schema_privilege('anon', 'net', 'USAGE')
     OR has_schema_privilege('authenticated', 'net', 'USAGE') THEN
    RAISE EXCEPTION 'Client roles still have USAGE on schema net';
  END IF;

  -- cron job 1 (nightly-aggregate-engagement) runs as postgres and calls net.http_post.
  IF NOT has_function_privilege(
       'postgres', 'net.http_post(text, jsonb, jsonb, jsonb, integer)', 'EXECUTE')
     OR NOT has_schema_privilege('postgres', 'net', 'USAGE') THEN
    RAISE EXCEPTION 'postgres lost net.http_post; the nightly engagement cron would fail';
  END IF;

  IF NOT has_function_privilege(
       'service_role', 'net.http_post(text, jsonb, jsonb, jsonb, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost net.http_post';
  END IF;
END;
$$;

SELECT 'PASS: pg_net is not callable by anon or authenticated; postgres cron keeps access' AS result;
ROLLBACK;
