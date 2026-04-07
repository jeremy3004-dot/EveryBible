-- Phase 18: Reading Plans v2
-- Adds cover_image_url, featured, completion_count columns to reading_plans
-- Creates user_saved_plans table with RLS

-- ---------------------------------------------------------------------------
-- 1. ALTER reading_plans to add new columns
-- ---------------------------------------------------------------------------

ALTER TABLE reading_plans ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE reading_plans ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
ALTER TABLE reading_plans ADD COLUMN IF NOT EXISTS completion_count INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. UPDATE each plan with cover images, featured status, and seed completion counts
-- ---------------------------------------------------------------------------

UPDATE reading_plans SET
  cover_image_url = 'https://picsum.photos/seed/bible1year/800/400',
  featured = true,
  completion_count = 5280
WHERE slug = 'bible-in-1-year';

UPDATE reading_plans SET
  cover_image_url = 'https://picsum.photos/seed/nt90/800/400',
  featured = false,
  completion_count = 2890
WHERE slug = 'new-testament-90-days';

UPDATE reading_plans SET
  cover_image_url = 'https://picsum.photos/seed/psalms30/800/400',
  featured = false,
  completion_count = 8420
WHERE slug = 'psalms-30-days';

UPDATE reading_plans SET
  cover_image_url = 'https://picsum.photos/seed/gospels60/800/400',
  featured = false,
  completion_count = 4100
WHERE slug = 'gospels-60-days';

UPDATE reading_plans SET
  cover_image_url = 'https://picsum.photos/seed/proverbs31/800/400',
  featured = false,
  completion_count = 6730
WHERE slug = 'proverbs-31-days';

UPDATE reading_plans SET
  cover_image_url = 'https://picsum.photos/seed/chronological/800/400',
  featured = false,
  completion_count = 3150
WHERE slug = 'genesis-to-revelation-chronological';

UPDATE reading_plans SET
  cover_image_url = 'https://picsum.photos/seed/epistles30/800/400',
  featured = false,
  completion_count = 1950
WHERE slug = 'epistles-30-days';

UPDATE reading_plans SET
  cover_image_url = 'https://picsum.photos/seed/sermon7/800/400',
  featured = false,
  completion_count = 12400
WHERE slug = 'sermon-on-the-mount-7-days';

-- ---------------------------------------------------------------------------
-- 3. CREATE user_saved_plans table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_saved_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plan_id)
);

CREATE INDEX idx_user_saved_plans_user ON user_saved_plans(user_id);

ALTER TABLE user_saved_plans ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. RLS policies for user_saved_plans (own-only)
-- ---------------------------------------------------------------------------

CREATE POLICY "saved_plans_select_own" ON user_saved_plans
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "saved_plans_insert_own" ON user_saved_plans
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "saved_plans_delete_own" ON user_saved_plans
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
