-- Phase 21: Content Versioning & Multiple Translations
-- Translation version tracking and user translation preferences

-- Translation version management
CREATE TABLE IF NOT EXISTS translation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_id TEXT NOT NULL,                -- 'BSB', 'WEB', 'KJV', 'ASV'
  version_number INTEGER NOT NULL,
  changelog TEXT,
  data_checksum TEXT,                           -- SHA-256 of the SQLite pack file
  total_books INTEGER,
  total_chapters INTEGER,
  total_verses INTEGER,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN DEFAULT false,
  UNIQUE (translation_id, version_number)
);

-- Translation catalog metadata (extends any Phase 14 runtime catalog)
CREATE TABLE IF NOT EXISTS translation_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_id TEXT UNIQUE NOT NULL,          -- 'BSB', 'WEB', 'KJV'
  name TEXT NOT NULL,                           -- 'Berean Standard Bible'
  abbreviation TEXT NOT NULL,                   -- 'BSB'
  language_code TEXT NOT NULL DEFAULT 'en',     -- ISO 639-1
  language_name TEXT NOT NULL DEFAULT 'English',
  license_type TEXT,                            -- 'public-domain', 'cc-by', 'restricted'
  license_url TEXT,
  source_url TEXT,                              -- where the data came from
  has_audio BOOLEAN DEFAULT false,
  has_text BOOLEAN DEFAULT true,
  is_bundled BOOLEAN DEFAULT false,             -- ships with app
  is_available BOOLEAN DEFAULT true,            -- visible in catalog
  sort_order INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User translation preferences (synced across devices)
CREATE TABLE IF NOT EXISTS user_translation_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  primary_translation TEXT NOT NULL DEFAULT 'BSB',
  secondary_translation TEXT,                   -- for future comparison mode
  audio_translation TEXT,                       -- preferred audio source
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Indexes
CREATE INDEX idx_translation_versions_tid ON translation_versions(translation_id);
CREATE INDEX idx_translation_versions_current ON translation_versions(translation_id) WHERE is_current = true;
CREATE INDEX idx_translation_catalog_language ON translation_catalog(language_code);
CREATE INDEX idx_translation_catalog_available ON translation_catalog(is_available) WHERE is_available = true;
CREATE INDEX idx_user_translation_prefs_user ON user_translation_preferences(user_id);

-- RLS
ALTER TABLE translation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_translation_preferences ENABLE ROW LEVEL SECURITY;

-- Translation catalog and versions: publicly readable
CREATE POLICY "catalog_select_all"
  ON translation_catalog FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "versions_select_all"
  ON translation_versions FOR SELECT TO authenticated
  USING (true);

-- User preferences: own only
CREATE POLICY "translation_prefs_select_own"
  ON user_translation_preferences FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "translation_prefs_insert_own"
  ON user_translation_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "translation_prefs_update_own"
  ON user_translation_preferences FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "translation_prefs_delete_own"
  ON user_translation_preferences FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Trigger for catalog updated_at
CREATE TRIGGER update_translation_catalog_updated_at
  BEFORE UPDATE ON translation_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed initial translation catalog entries
INSERT INTO translation_catalog (translation_id, name, abbreviation, language_code, language_name, license_type, has_audio, has_text, is_bundled, sort_order) VALUES
  ('BSB', 'Berean Standard Bible', 'BSB', 'en', 'English', 'public-domain', true, true, true, 1),
  ('WEB', 'World English Bible', 'WEB', 'en', 'English', 'public-domain', true, true, false, 2),
  ('KJV', 'King James Version', 'KJV', 'en', 'English', 'public-domain', false, true, false, 3),
  ('ASV', 'American Standard Version', 'ASV', 'en', 'English', 'public-domain', false, true, false, 4),
  ('YLT', 'Young''s Literal Translation', 'YLT', 'en', 'English', 'public-domain', false, true, false, 5),
  ('BBE', 'Bible in Basic English', 'BBE', 'en', 'English', 'public-domain', false, true, false, 6),
  ('RVR', 'Reina-Valera Revisada', 'RVR', 'es', 'Spanish', 'public-domain', false, true, false, 10)
ON CONFLICT (translation_id) DO NOTHING;

-- Seed initial version entries for bundled translations
INSERT INTO translation_versions (translation_id, version_number, is_current, total_books, total_chapters, total_verses) VALUES
  ('BSB', 1, true, 66, 1189, 31102),
  ('WEB', 1, true, 66, 1189, 31102)
ON CONFLICT (translation_id, version_number) DO NOTHING;
