-- ALREADY LIVE. This file exists so that a fresh database matches production.
--
-- Do not treat this as a pending change for production (project ganmududzdzpruvdulkg).
-- Every object below was created there by hand, through the dashboard or the Management
-- API, and no repo migration created it. The live state was read on 2026-09-24 with
-- read-only catalog queries. The file is idempotent: on production every statement finds
-- the object already in place and does nothing. To record it in production's history without
-- running it:
--   supabase migration repair --status applied 20260710095000
--
-- WHY THIS VERSION (2026-07-10 09:50, not today's date)
--   Two earlier-applied migrations fail on a database that has neither pg_cron nor pg_net:
--     20260710095248_analytics_retention_rollups_indexes  `IF EXISTS (pg_cron) AND NOT EXISTS
--        (SELECT ... FROM cron.job)` is planned as one expression, so it raises
--        "relation cron.job does not exist" when pg_cron is absent.
--     20260923233714_revoke_client_execute_on_pg_net      `GRANT USAGE ON SCHEMA net` fails
--        when pg_net is absent.
--   Giving this file a version just before 20260710095248 means a fresh replay installs both
--   extensions before those two migrations run. The applied files do not have to be edited.
--   On production the version sorts before the last applied migration, so record it with the
--   repair command above. A plain `supabase db push` would ask for --include-all. Running it
--   that way is also harmless because every statement is guarded.
--
-- WHAT IT CAPTURES
--   | # | Object                                        | Live state (2026-09-24)                      | Captured as                                  |
--   |---|-----------------------------------------------|----------------------------------------------|----------------------------------------------|
--   | 1 | extension pg_cron 1.6.4                       | installed, schema pg_catalog                 | CREATE EXTENSION IF NOT EXISTS               |
--   | 2 | extension pg_net 0.19.5                       | installed, extension schema public (objects  | CREATE EXTENSION IF NOT EXISTS ... SCHEMA    |
--   |   |                                               | in schema net)                               | public (matches prod; advisor WARN           |
--   |   |                                               |                                              | extension_in_public)                         |
--   | 3 | vault secret aggregate_engagement_service_key | exists (service-role key, created 06-12)     | NAME ONLY: existence check + NOTICE. The     |
--   |   |                                               |                                              | value is never in the repo                   |
--   | 4 | cron job nightly-aggregate-engagement         | `0 2 * * *`, user postgres, net.http_post to | cron.schedule IF NOT EXISTS; URL and key     |
--   |   |                                               | <project>/functions/v1/aggregate-engagement, | read from vault by name AT RUN TIME;         |
--   |   |                                               | Bearer = vault secret (#3)                   | skips the call while either secret is absent |
--   | 5 | storage bucket bible-audio limits             | file_size_limit NULL, allowed_mime_types     | UPDATE ... WHERE IS DISTINCT FROM            |
--   |   |                                               | NULL (repo 20260322150000 says 50 MB + 5     | (a no-op on prod)                            |
--   |   |                                               | audio MIME types; its INSERT was ON CONFLICT |                                              |
--   |   |                                               | DO NOTHING against a bucket created by hand) |                                              |
--
-- DELIBERATELY NOT CAPTURED (live-only, but not part of the schema)
--   * Schema `backups` and its 7 tables (`*_20260910`, `*_20260924`): point-in-time data
--     snapshots taken before the 2026-09-10 and 2026-09-24 repairs.
--   * public.translation_catalog_availability_backup_2026_08_25: manual R2-cutover snapshot
--     (hardened by 20260910090000 when present).
--   * Role cli_login_postgres: created by the Supabase CLI for `supabase db` logins.
--   * Publication supabase_realtime (no tables), extensions pgcrypto, uuid-ossp,
--     pg_stat_statements, supabase_vault, default ACLs, and Supabase-owned storage/auth
--     triggers. These are platform defaults that every Supabase project already has.
--   * The other two cron jobs, nightly-analytics-maintenance and
--     nightly-app-error-reports-purge. Repo migrations 20260710095248 and 20260924043614
--     already create them once pg_cron exists, which this file now guarantees.
--
-- FRESH-ENVIRONMENT SETUP (after migrations; values never go in the repo)
--   select vault.create_secret('<https://<ref>.supabase.co>', 'project_url',
--                              'Base URL used by cron jobs that call edge functions');
--   select vault.create_secret('<service role key>', 'aggregate_engagement_service_key',
--                              'Service role key for nightly aggregate-engagement cron');
--   Production's job hardcodes its own URL instead of reading `project_url`. Otherwise it
--   sends the same request, on the same schedule, as the job this file creates.

-- 1. pg_cron -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 2. pg_net (prod has it in `public`; its functions live in schema `net` either way) ------
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

-- 3. Vault secret, checked by NAME only --------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'aggregate_engagement_service_key') THEN
    RAISE NOTICE 'vault secret aggregate_engagement_service_key is missing: nightly-aggregate-engagement will skip its call until it is created (see header).';
  END IF;
  -- Production does not need project_url: its job hardcodes the URL. Only a job created by
  -- step 4 below reads project_url.
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    RAISE NOTICE 'vault secret project_url is missing: a nightly-aggregate-engagement job created by this migration skips its call until it is created (see header).';
  END IF;
END;
$$;

-- 4. Cron job nightly-aggregate-engagement -----------------------------------------------
-- Only created when absent, so production's existing job (hardcoded URL) is left untouched.
-- The command reads both secrets when it runs, and the WHERE gate means no HTTP call is made
-- until both exist. It never reaches production's function from another environment.
-- The IFs are nested because PL/pgSQL plans a combined condition as one query (see
-- 20260924043614).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-aggregate-engagement') THEN
      PERFORM cron.schedule(
        'nightly-aggregate-engagement',
        '0 2 * * *',
        $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/aggregate-engagement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aggregate_engagement_service_key')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'aggregate_engagement_service_key');
  $cron$
      );
    END IF;
  END IF;
END;
$$;

-- 5. bible-audio bucket limits (match production: no size cap, no MIME allow-list) -------
UPDATE storage.buckets
SET file_size_limit = NULL,
    allowed_mime_types = NULL
WHERE id = 'bible-audio'
  AND (file_size_limit IS DISTINCT FROM NULL OR allowed_mime_types IS DISTINCT FROM NULL);
