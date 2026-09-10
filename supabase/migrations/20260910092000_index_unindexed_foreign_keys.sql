-- M3 (live advisor INFO: unindexed_foreign_keys)
--
-- Postgres does not create an index for a foreign key's REFERENCING column. Without one,
-- every DELETE/UPDATE on the referenced parent row has to seq-scan the child table to
-- enforce the constraint action (ON DELETE SET NULL / CASCADE), and every join or filter
-- on that column does the same. The 11 FKs below are all currently unindexed.
--
-- All eleven tables are small (admin/CMS tables, group + saved-plan join tables, the
-- feedback queue), so the indexes are cheap to build and cheap to maintain.
--
-- NOTE: deliberately NOT CONCURRENTLY. Supabase runs each migration inside a transaction and
-- CREATE INDEX CONCURRENTLY cannot run in one. The plain form takes a SHARE lock on the
-- table for the duration of the build, which on tables of this size is milliseconds.
--
-- Every statement is IF NOT EXISTS, so replaying this migration is a no-op.

-- 20260401130000_create_web_admin_platform.sql — admin/CMS tables.
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_user_id
  ON public.admin_audit_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_content_images_uploaded_by
  ON public.content_images (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_translation_sync_runs_triggered_by
  ON public.translation_sync_runs (triggered_by);

CREATE INDEX IF NOT EXISTS idx_verse_of_day_entries_created_by
  ON public.verse_of_day_entries (created_by);

CREATE INDEX IF NOT EXISTS idx_verse_of_day_entries_updated_by
  ON public.verse_of_day_entries (updated_by);

CREATE INDEX IF NOT EXISTS idx_verse_of_day_entries_image_id
  ON public.verse_of_day_entries (image_id);

-- 20260401130000_create_web_admin_platform.sql:36 added translation_catalog.sync_run_id
-- (table itself from 20260322140700_create_content_versioning.sql).
CREATE INDEX IF NOT EXISTS idx_translation_catalog_sync_run_id
  ON public.translation_catalog (sync_run_id);

-- 20260322140400_create_reading_plans.sql:43 — group_reading_plans already indexes group_id
-- (idx_group_plans_group) but neither FK below.
CREATE INDEX IF NOT EXISTS idx_group_reading_plans_plan_id
  ON public.group_reading_plans (plan_id);

CREATE INDEX IF NOT EXISTS idx_group_reading_plans_assigned_by
  ON public.group_reading_plans (assigned_by);

-- 20260407000100_reading_plans_v2.sql:69 — user_saved_plans already indexes user_id
-- (idx_user_saved_plans_user) but not the plan side of the join.
CREATE INDEX IF NOT EXISTS idx_user_saved_plans_plan_id
  ON public.user_saved_plans (plan_id);

-- 20260522164000_add_chapter_feedback_scripture_council_fix_status.sql:3 — the translator
-- who marked an item fixed.
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_submissions_scripture_council_fixed_by
  ON public.chapter_feedback_submissions (scripture_council_fixed_by);
