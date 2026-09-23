-- Retire the homepage override contract created by 20260402210000.
--
-- Nothing writes site_content_entries (the OpenClaw operator was removed in a6356873) and the
-- site stopped reading get_live_homepage_content() when the homepage became the language
-- atlas (a5f30bb0). Production no longer has these objects; they were dropped outside
-- migrations. This makes local, preview, and CI databases match production.
-- See docs/research/supabase-migration-drift-2026-09-24.md, "Ordered action list" step 3.
--
-- Every statement is IF EXISTS, so this is a no-op on production.

DROP FUNCTION IF EXISTS public.get_live_homepage_content(timestamptz);

-- Dropping the table also drops its trigger (update_site_content_entries_updated_at) and
-- index (idx_site_content_entries_state).
DROP TABLE IF EXISTS public.site_content_entries;
