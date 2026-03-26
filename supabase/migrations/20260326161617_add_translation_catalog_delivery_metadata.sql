-- Phase 14: backend-driven audio delivery metadata for translation catalog entries
-- Keeps delivery rules in Supabase so future audio Bibles can be added without app code changes.

ALTER TABLE translation_catalog
ADD COLUMN IF NOT EXISTS catalog JSONB;

COMMENT ON COLUMN translation_catalog.catalog IS
'Delivery contract for translation text/audio packs consumed by runtime catalog hydration and offline download flows.';

UPDATE translation_catalog
SET catalog = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(catalog, '{}'::jsonb),
        '{version}',
        to_jsonb('2026.03.26-media-v1'::text),
        true
      ),
      '{updatedAt}',
      to_jsonb('2026-03-26T16:00:22.000Z'::text),
      true
    ),
    '{audio}',
    jsonb_build_object(
      'strategy', 'stream-template',
      'baseUrl', 'https://ganmududzdzpruvdulkg.supabase.co/storage/v1/object/public/bible-audio/bsb',
      'chapterPathTemplate', '{bookId}/{chapter}.m4a',
      'fileExtension', 'm4a',
      'mimeType', 'audio/mp4'
    ),
    true
  ),
  has_audio = true
WHERE translation_id = 'BSB';

UPDATE translation_catalog
SET catalog = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(catalog, '{}'::jsonb),
        '{version}',
        to_jsonb('2026.03.26-media-v1'::text),
        true
      ),
      '{updatedAt}',
      to_jsonb('2026-03-26T16:00:22.000Z'::text),
      true
    ),
    '{audio}',
    jsonb_build_object(
      'strategy', 'provider',
      'provider', 'ebible-webbe',
      'fileExtension', 'mp3',
      'mimeType', 'audio/mpeg'
    ),
    true
  ),
  has_audio = true
WHERE translation_id = 'WEB';
