-- Audit 2026-09-24 L2: service-only tables must carry no client-role grants.
-- Run against a local or linked database as postgres (read-only assertions).
-- Before 20260923233710_revoke_client_grants_on_service_only_tables.sql this fails:
-- anon and authenticated held every table privilege on these RLS-without-policy tables.
-- translator_team_passcodes (hashed team review passcodes) is created without client grants
-- by 20260924014137_add_translator_team_passcodes.sql; translator_access_settings and
-- translator_shared_passcode_uses by 20260924150000_translator_shared_passcode_switch.sql.
BEGIN;

DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(format('%s:%s:%s', r.role_name, t.table_name, p.privilege), ', ')
  INTO offenders
  FROM unnest(ARRAY[
    'admin_audit_logs',
    'analytics_monthly_rollup',
    'content_images',
    'translation_sync_runs',
    'translator_access_settings',
    'translator_review_attempts',
    'translator_shared_passcode_uses',
    'translator_team_passcodes',
    'verse_of_day_entries'
  ]) AS t(table_name)
  CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS r(role_name)
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
    AS p(privilege)
  WHERE has_table_privilege(r.role_name, format('public.%I', t.table_name), p.privilege);

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Client roles still hold grants on service-only tables: %', offenders;
  END IF;

  -- No profiles DELETE policy exists; account deletion cascades from auth.users as the
  -- SECURITY DEFINER owner, so client roles need no DELETE (or TRUNCATE, which skips RLS).
  IF has_table_privilege('anon', 'public.profiles', 'DELETE')
     OR has_table_privilege('authenticated', 'public.profiles', 'DELETE')
     OR has_table_privilege('anon', 'public.profiles', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Client roles must not hold DELETE or TRUNCATE on public.profiles';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.admin_audit_logs', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.translator_review_attempts', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.translator_team_passcodes', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.translator_team_passcodes', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.translator_access_settings', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.translator_shared_passcode_uses', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.verse_of_day_entries', 'SELECT') THEN
    RAISE EXCEPTION 'service_role must keep access to the service-only tables';
  END IF;

  -- Profile reads and the sync upsert are unaffected.
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated lost the profile access the app needs';
  END IF;
END;
$$;

SELECT 'PASS: service-only tables have no client-role grants' AS result;
ROLLBACK;
