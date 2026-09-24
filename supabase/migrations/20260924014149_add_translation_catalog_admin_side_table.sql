-- M3 follow-up, phase 1 of 2 (docs/research/supabase-security-audit-2026-09-24.md).
--
-- translation_catalog is readable by anon/authenticated (available rows only, since
-- 20260923233258). Every shipped app build reads it with select('*'), and PostgREST expands * to
-- every column, so the operator-only columns cannot be hidden with a column-level REVOKE: that
-- would fail the whole request and empty the translation picker. Instead they move to a side
-- table that client roles cannot read at all:
--   admin_notes, upstream_payload, upstream_external_id, sync_run_id
-- Once the columns are gone (phase 2), select('*') from old builds keeps working and simply stops
-- returning them. No shipped app build, script, edge function, view, or function reads these
-- columns (checked 2026-09-24: git history of src/, scripts/, apps/site, supabase/functions, and
-- pg_depend / pg_proc / pg_views on production; only the sync_run_id FK and index depend on them).
--
-- APPLY ORDER
--   1. This migration. Safe while the current admin build is still deployed: the old columns stay,
--      and a transition trigger mirrors every write the old build makes to them into the side table.
--   2. Deploy the admin app that reads/writes translation_catalog_admin.
--   3. 20260924014641_drop_translation_catalog_admin_columns.sql, only after step 2 is live on every
--      admin instance (the old build selects these columns by name and would fail once they are dropped).
--
-- Access: RLS on, no policies, client grants revoked. The admin app and scripts use the service
-- role (BYPASSRLS); the owner (postgres) keeps full access.

CREATE TABLE IF NOT EXISTS public.translation_catalog_admin (
  translation_id text PRIMARY KEY
    REFERENCES public.translation_catalog (translation_id) ON UPDATE CASCADE ON DELETE CASCADE,
  admin_notes text,
  upstream_external_id text,
  upstream_payload jsonb,
  sync_run_id uuid REFERENCES public.translation_sync_runs (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_translation_catalog_admin_sync_run_id
  ON public.translation_catalog_admin (sync_run_id);

ALTER TABLE public.translation_catalog_admin ENABLE ROW LEVEL SECURITY;

-- Supabase default privileges grant ALL on new public tables to anon and authenticated.
REVOKE ALL ON public.translation_catalog_admin FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.translation_catalog_admin TO service_role;

COMMENT ON TABLE public.translation_catalog_admin IS
  'Operator-only translation_catalog data (notes, upstream sync provenance). RLS enabled with no policies and client roles revoked: service-role / owner access only. Kept off translation_catalog because the app reads that table with select(*).';

-- Backfill every row that carries operator data (7 of 216 rows on 2026-09-24).
INSERT INTO public.translation_catalog_admin
  (translation_id, admin_notes, upstream_external_id, upstream_payload, sync_run_id)
SELECT translation_id, admin_notes, upstream_external_id, upstream_payload, sync_run_id
FROM public.translation_catalog
WHERE admin_notes IS NOT NULL
   OR upstream_external_id IS NOT NULL
   OR upstream_payload IS NOT NULL
   OR sync_run_id IS NOT NULL
ON CONFLICT (translation_id) DO NOTHING;

-- Transition mirror, removed in phase 2. While the old admin build is still serving, its writes
-- to the old columns are copied here so nothing is lost before the new build takes over. On
-- UPDATE only the columns that statement actually changed are copied, so a stale old-build write
-- (e.g. a sync run that re-sends an unchanged admin_notes value) cannot overwrite a newer value
-- the new build has already written to the side table.
CREATE OR REPLACE FUNCTION public.mirror_translation_catalog_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.admin_notes IS NULL
       AND NEW.upstream_external_id IS NULL
       AND NEW.upstream_payload IS NULL
       AND NEW.sync_run_id IS NULL THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.translation_catalog_admin AS side
      (translation_id, admin_notes, upstream_external_id, upstream_payload, sync_run_id)
    VALUES
      (NEW.translation_id, NEW.admin_notes, NEW.upstream_external_id, NEW.upstream_payload, NEW.sync_run_id)
    ON CONFLICT (translation_id) DO UPDATE SET
      admin_notes = EXCLUDED.admin_notes,
      upstream_external_id = EXCLUDED.upstream_external_id,
      upstream_payload = EXCLUDED.upstream_payload,
      sync_run_id = EXCLUDED.sync_run_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.translation_catalog_admin AS side
    (translation_id, admin_notes, upstream_external_id, upstream_payload, sync_run_id)
  VALUES
    (NEW.translation_id, NEW.admin_notes, NEW.upstream_external_id, NEW.upstream_payload, NEW.sync_run_id)
  ON CONFLICT (translation_id) DO UPDATE SET
    admin_notes = CASE WHEN NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
      THEN EXCLUDED.admin_notes ELSE side.admin_notes END,
    upstream_external_id = CASE WHEN NEW.upstream_external_id IS DISTINCT FROM OLD.upstream_external_id
      THEN EXCLUDED.upstream_external_id ELSE side.upstream_external_id END,
    upstream_payload = CASE WHEN NEW.upstream_payload IS DISTINCT FROM OLD.upstream_payload
      THEN EXCLUDED.upstream_payload ELSE side.upstream_payload END,
    sync_run_id = CASE WHEN NEW.sync_run_id IS DISTINCT FROM OLD.sync_run_id
      THEN EXCLUDED.sync_run_id ELSE side.sync_run_id END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_translation_catalog_admin_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mirror_translation_catalog_admin_columns ON public.translation_catalog;
CREATE TRIGGER mirror_translation_catalog_admin_columns
  AFTER INSERT OR UPDATE OF admin_notes, upstream_external_id, upstream_payload, sync_run_id
  ON public.translation_catalog
  FOR EACH ROW EXECUTE FUNCTION public.mirror_translation_catalog_admin_columns();
