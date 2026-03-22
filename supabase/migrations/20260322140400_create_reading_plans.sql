-- Phase 18: Reading Plans
-- Pre-seeded Bible reading plans with user enrollment, progress tracking, and group assignments

-- Plan metadata
CREATE TABLE IF NOT EXISTS reading_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,                    -- 'bible-in-1-year', 'psalms-30-days'
  title_key TEXT NOT NULL,                      -- i18n translation key
  description_key TEXT,                         -- i18n translation key
  duration_days INTEGER NOT NULL,
  category TEXT CHECK (category IN ('chronological', 'topical', 'book-study', 'devotional', 'custom')),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily reading assignments for each plan
CREATE TABLE IF NOT EXISTS reading_plan_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  book TEXT NOT NULL,                           -- e.g., 'GEN'
  chapter_start INTEGER NOT NULL,
  chapter_end INTEGER,                          -- NULL for single chapter
  UNIQUE (plan_id, day_number, book, chapter_start)
);

-- User enrollment and progress tracking
CREATE TABLE IF NOT EXISTS user_reading_plan_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_entries JSONB DEFAULT '{}',         -- {"1": "2026-03-22T...", "5": "2026-03-26T..."}
  current_day INTEGER DEFAULT 1,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, plan_id)
);

-- Group plan assignments (leader assigns plan to group)
CREATE TABLE IF NOT EXISTS group_reading_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, plan_id)
);

-- Indexes
CREATE INDEX idx_plan_entries_plan_id ON reading_plan_entries(plan_id);
CREATE INDEX idx_plan_entries_plan_day ON reading_plan_entries(plan_id, day_number);
CREATE INDEX idx_user_plan_progress_user ON user_reading_plan_progress(user_id);
CREATE INDEX idx_user_plan_progress_plan ON user_reading_plan_progress(plan_id);
CREATE INDEX idx_group_plans_group ON group_reading_plans(group_id);

-- RLS
ALTER TABLE reading_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_plan_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reading_plan_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_reading_plans ENABLE ROW LEVEL SECURITY;

-- Reading plans are public (anyone can browse available plans)
CREATE POLICY "plans_select_all"
  ON reading_plans FOR SELECT TO authenticated
  USING (true);

-- Plan entries are public (anyone can see what a plan contains)
CREATE POLICY "plan_entries_select_all"
  ON reading_plan_entries FOR SELECT TO authenticated
  USING (true);

-- User progress: own only
CREATE POLICY "plan_progress_select_own"
  ON user_reading_plan_progress FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "plan_progress_insert_own"
  ON user_reading_plan_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "plan_progress_update_own"
  ON user_reading_plan_progress FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "plan_progress_delete_own"
  ON user_reading_plan_progress FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Group plans: group members can see, leaders can assign
CREATE POLICY "group_plans_select_member"
  ON group_reading_plans FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_reading_plans.group_id
      AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "group_plans_insert_leader"
  ON group_reading_plans FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_reading_plans.group_id
      AND leader_id = (select auth.uid())
    )
  );

CREATE POLICY "group_plans_delete_leader"
  ON group_reading_plans FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_reading_plans.group_id
      AND leader_id = (select auth.uid())
    )
  );

-- Seed initial reading plans (metadata only - entries seeded separately)
INSERT INTO reading_plans (slug, title_key, description_key, duration_days, category, sort_order) VALUES
  ('bible-in-1-year', 'readingPlans.bibleIn1Year.title', 'readingPlans.bibleIn1Year.description', 365, 'chronological', 1),
  ('new-testament-90-days', 'readingPlans.newTestament90.title', 'readingPlans.newTestament90.description', 90, 'book-study', 2),
  ('psalms-30-days', 'readingPlans.psalms30.title', 'readingPlans.psalms30.description', 30, 'book-study', 3),
  ('gospels-60-days', 'readingPlans.gospels60.title', 'readingPlans.gospels60.description', 60, 'book-study', 4),
  ('proverbs-31-days', 'readingPlans.proverbs31.title', 'readingPlans.proverbs31.description', 31, 'devotional', 5),
  ('genesis-to-revelation-chronological', 'readingPlans.chronological.title', 'readingPlans.chronological.description', 365, 'chronological', 6),
  ('epistles-30-days', 'readingPlans.epistles30.title', 'readingPlans.epistles30.description', 30, 'book-study', 7),
  ('sermon-on-the-mount-7-days', 'readingPlans.sermonMount7.title', 'readingPlans.sermonMount7.description', 7, 'topical', 8)
ON CONFLICT (slug) DO NOTHING;
