-- M3 (docs/research/supabase-security-audit-2026-09-24.md): translation_catalog was readable in
-- full by anyone holding the publishable key. Both client SELECT policies used USING (true), so
-- anon could list 214 unavailable (unlaunched or gated) translations, read admin_notes, and pull
-- pack download URLs from catalog / upstream_payload, bypassing the in-app launch gate.
--
-- Fix: client roles see only rows with is_available = true. The admin app
-- (apps/admin, createAdminServiceClient) and the publishing scripts use the service role, which
-- bypasses RLS, so they keep full access.
--
-- Client compatibility, checked against every shipped client query in git history:
--   * src/services/translations/translationService.ts (since 2026-03-22):
--       select('*').eq('is_available', true).order('sort_order')
--     Already asks only for available rows, so its result set is unchanged.
--   * src/services/bible/cloudTranslationService.ts resolveSupabaseTranslationId (since 2026-03-24):
--       select('translation_id').ilike('translation_id', id).maybeSingle()
--     For an unavailable translation this now returns no row and falls back to the requested id
--     (plus the alias map). Only builds from before 2026-04-03 call it on a download path, and those
--     builds list only available translations.
--   * scripts/export_translation_text_packs.py reads with the anon key and filters
--     is_available=eq.true, so it is unchanged.
--   * apps/site and the edge functions do not read this table.
--
-- This migration deliberately does NOT revoke column-level SELECT: shipped builds use select('*'),
-- and PostgREST expands * to every column, so revoking any column would fail the whole request
-- with "permission denied" and empty the translation picker on every installed version.
-- Residual exposure: admin_notes, upstream_payload, upstream_external_id, and sync_run_id stay
-- readable on the few AVAILABLE rows (none of the 2 available rows had notes or payload on
-- 2026-09-24). Follow-up: move those columns to an admin-only side table.

DROP POLICY IF EXISTS "catalog_select_all" ON public.translation_catalog;
DROP POLICY IF EXISTS "catalog_select_anon" ON public.translation_catalog;

CREATE POLICY "catalog_select_available"
  ON public.translation_catalog FOR SELECT TO anon, authenticated
  USING (is_available IS TRUE);

-- No client write policies exist, so RLS already blocks INSERT/UPDATE/DELETE. TRUNCATE is not
-- subject to RLS, so remove the write grants too. SELECT is kept (see the note above).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.translation_catalog FROM anon, authenticated;
