-- Phase 17: Bookmarks, Highlights & Notes
-- Verse-level annotations with offline-first sync support

CREATE TABLE IF NOT EXISTS user_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book TEXT NOT NULL,                -- e.g., 'GEN', 'PSA', 'JHN'
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER,                 -- NULL for single verse
  type TEXT NOT NULL CHECK (type IN ('bookmark', 'highlight', 'note')),
  color TEXT,                        -- highlight color (e.g., '#FFD700', 'yellow')
  content TEXT,                      -- note text content (nullable for bookmarks/highlights)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ             -- soft delete for cross-device sync
);

-- Indexes for common query patterns
CREATE INDEX idx_annotations_user_id ON user_annotations(user_id);
CREATE INDEX idx_annotations_user_book_chapter ON user_annotations(user_id, book, chapter);
CREATE INDEX idx_annotations_user_type ON user_annotations(user_id, type);
CREATE INDEX idx_annotations_user_synced ON user_annotations(user_id, synced_at);
CREATE INDEX idx_annotations_not_deleted ON user_annotations(user_id)
  WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE user_annotations ENABLE ROW LEVEL SECURITY;

-- Users can only access their own annotations
CREATE POLICY "annotations_select_own"
  ON user_annotations FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "annotations_insert_own"
  ON user_annotations FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "annotations_update_own"
  ON user_annotations FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "annotations_delete_own"
  ON user_annotations FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON user_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
