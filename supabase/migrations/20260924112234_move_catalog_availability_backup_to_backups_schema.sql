-- Move the 2026-08-25 R2-cutover snapshot out of the API-exposed public schema.
--
-- public.translation_catalog_availability_backup_2026_08_25 (216 rows) was made by hand
-- before the 2026-08-25 R2 cutover (see 20260710095000 and 20260910090000). It sits in
-- `public`, the schema PostgREST exposes. 20260910090000 enabled RLS with no policies and
-- revoked anon/authenticated, so it is not readable today, but a single mistaken GRANT
-- would publish it. The other hand-made snapshots already live in `backups`, which is
-- owned by postgres, grants USAGE to nobody else and is not an exposed API schema.
--
-- Live checks (read-only, 2026-09-24): the table has no dependent views, functions or
-- policies (pg_depend, pg_policy); no backups.* table has the same name; `backups` exists
-- (owner postgres, ACL {postgres=UC/postgres}).
--
-- ALTER TABLE ... SET SCHEMA keeps the rows, RLS flag, table ACL and comment. service_role
-- keeps its table grant but has no USAGE on `backups`, so after this only postgres (SQL
-- editor / migrations) can read it, the same as the other snapshots. Nothing in apps/**,
-- src/** or supabase/functions/** references the table.
--
-- Follow-up for whoever runs the R2 revert: the restore SQL in the 2026-08-25 disconnect
-- notes selects `FROM translation_catalog_availability_backup_2026_08_25`; after this
-- migration it must read `FROM backups.translation_catalog_availability_backup_2026_08_25`.
--
-- Guarded so it is a no-op on a fresh database (the table was never created by a
-- migration) and on replay.
--
-- Risk: very low. A metadata-only change under a brief ACCESS EXCLUSIVE lock on a table
-- nothing queries.
-- Rollback:
--   ALTER TABLE backups.translation_catalog_availability_backup_2026_08_25 SET SCHEMA public;

SET lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.translation_catalog_availability_backup_2026_08_25') IS NULL THEN
    RAISE NOTICE 'skip: public.translation_catalog_availability_backup_2026_08_25 does not exist';
    RETURN;
  END IF;
  IF to_regclass('backups.translation_catalog_availability_backup_2026_08_25') IS NOT NULL THEN
    RAISE EXCEPTION 'backups.translation_catalog_availability_backup_2026_08_25 already exists; resolve by hand';
  END IF;

  CREATE SCHEMA IF NOT EXISTS backups;
  REVOKE ALL ON SCHEMA backups FROM PUBLIC, anon, authenticated;
  ALTER TABLE public.translation_catalog_availability_backup_2026_08_25 SET SCHEMA backups;
END;
$$;
