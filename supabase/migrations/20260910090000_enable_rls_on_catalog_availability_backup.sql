-- M1 (live advisor ERROR: rls_disabled_in_public)
--
-- public.translation_catalog_availability_backup_2026_08_25 was created by hand in the
-- live database during the 2026-08-25 R2 bucket cutover (it snapshots the per-translation
-- availability flags so the cutover could be reverted). Because it was never written as a
-- migration it exists in NO migration file, and it was created WITHOUT row level security.
--
-- Every table in the `public` schema is auto-exposed through PostgREST, so an RLS-disabled
-- table there is readable (and writable, subject to grants) by anyone holding the anon key
-- — which ships inside the mobile app. This migration closes that exposure:
--   1. ENABLE ROW LEVEL SECURITY, and deliberately add NO policies. With RLS on and zero
--      policies the table is invisible to anon/authenticated while remaining fully
--      readable to the service role and to the table owner (postgres), which is all the
--      revert SQL needs.
--   2. REVOKE the table grants as well, so PostgREST does not even advertise the relation.
--
-- Guarded with to_regclass + ALTER TABLE IF EXISTS so this is a no-op on any environment
-- (local `supabase db reset`, a preview branch, CI) where the hand-made backup table was
-- never created. Re-running is harmless: ENABLE RLS and REVOKE are both idempotent.

DO $$
BEGIN
  IF to_regclass('public.translation_catalog_availability_backup_2026_08_25') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE IF EXISTS public.translation_catalog_availability_backup_2026_08_25 ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.translation_catalog_availability_backup_2026_08_25 FROM anon, authenticated';

    COMMENT ON TABLE public.translation_catalog_availability_backup_2026_08_25 IS
      'Manual 2026-08-25 R2 cutover snapshot of translation_catalog availability flags. '
      'RLS enabled with no policies and client roles revoked: service-role / owner access only.';
  END IF;
END;
$$;
