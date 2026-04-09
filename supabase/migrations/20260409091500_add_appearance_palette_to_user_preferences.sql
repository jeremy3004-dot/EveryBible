ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS appearance_palette TEXT NOT NULL DEFAULT 'ember';

ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_appearance_palette_check;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_appearance_palette_check
  CHECK (appearance_palette IN ('ember', 'sapphire', 'teal', 'olive'));
