-- Align user_preferences with the mobile preference upsert (syncService.syncPreferences).
--
-- Production rejected every local-to-server preference write for two reasons
-- (docs/research/app-backend-audit-2026-09-15.md, finding 1):
--   1. The client sends hide_play_button_from_reading_tab, which no migration
--      ever added (PostgreSQL 42703).
--   2. The client sends the EL palette ids ('el-blue', 'el-blue-brand'), which the
--      2026-04-09 palette CHECK does not admit.
--
-- The retired ids stay admitted: rows written before the EL reskin keep them
-- until the device next syncs, and the client normalises them on read. Existing
-- choices are not rewritten; only the default for new rows changes.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS hide_play_button_from_reading_tab BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_appearance_palette_check;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_appearance_palette_check
  CHECK (appearance_palette IN ('el-blue', 'el-blue-brand', 'ember', 'sapphire', 'teal', 'olive'));

ALTER TABLE public.user_preferences ALTER COLUMN appearance_palette SET DEFAULT 'el-blue';
