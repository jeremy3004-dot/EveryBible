-- Add premium reading background modes to the persisted theme contract.

ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_theme_check;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_theme_check
  CHECK (theme IN ('dark', 'light', 'low-light', 'parchment', 'midnight'));
