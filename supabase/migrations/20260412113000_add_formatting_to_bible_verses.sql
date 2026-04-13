-- Preserve line-break and poetry metadata for remote Bible text packs.
-- This keeps the Supabase bible_verses contract aligned with the bundled
-- SQLite schema so downloaded translations can retain structured layout.

ALTER TABLE IF EXISTS public.bible_verses
ADD COLUMN IF NOT EXISTS formatting JSONB;

COMMENT ON COLUMN public.bible_verses.formatting IS
  'Optional verse formatting payload for preserved line breaks and poetry indentation.';
