-- M3 follow-up, phase 2 of 2 (docs/research/supabase-security-audit-2026-09-24.md).
--
-- APPLY ONLY AFTER the admin app that uses public.translation_catalog_admin is deployed and live on
-- every instance. The previous admin build selects admin_notes / upstream_payload from
-- translation_catalog by name and writes admin_notes, sync_run_id, upstream_external_id and
-- upstream_payload to it, so it fails once these columns are gone. Order:
--   1. 20260924120000_add_translation_catalog_admin_side_table.sql
--   2. deploy apps/admin
--   3. this migration
--
-- After this, translation_catalog no longer carries operator data, so the app's select('*')
-- (every shipped build) keeps working and no longer returns these columns to anon/authenticated.
-- Dropping sync_run_id also drops translation_catalog_sync_run_id_fkey and
-- idx_translation_catalog_sync_run_id; nothing else depends on these columns (pg_depend, 2026-09-24).

-- The transition mirror references the columns; remove it first.
DROP TRIGGER IF EXISTS mirror_translation_catalog_admin_columns ON public.translation_catalog;
DROP FUNCTION IF EXISTS public.mirror_translation_catalog_admin_columns();

-- Last reconcile for any row whose data never reached the side table. DO NOTHING: an existing side
-- row may hold newer values written by the new admin build.
INSERT INTO public.translation_catalog_admin
  (translation_id, admin_notes, upstream_external_id, upstream_payload, sync_run_id)
SELECT translation_id, admin_notes, upstream_external_id, upstream_payload, sync_run_id
FROM public.translation_catalog
WHERE admin_notes IS NOT NULL
   OR upstream_external_id IS NOT NULL
   OR upstream_payload IS NOT NULL
   OR sync_run_id IS NOT NULL
ON CONFLICT (translation_id) DO NOTHING;

ALTER TABLE public.translation_catalog
  DROP COLUMN IF EXISTS admin_notes,
  DROP COLUMN IF EXISTS upstream_payload,
  DROP COLUMN IF EXISTS upstream_external_id,
  DROP COLUMN IF EXISTS sync_run_id;
