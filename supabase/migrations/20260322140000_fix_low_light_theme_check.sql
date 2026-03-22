-- Phase 16: Fix low-light theme CHECK constraint
-- The app now supports 'low-light' (Phase 15 reverential theme) but the DB
-- CHECK only allows 'dark' and 'light', causing silent sync failure.

ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_theme_check;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_theme_check
  CHECK (theme IN ('dark', 'light', 'low-light'));
