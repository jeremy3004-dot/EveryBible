ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS hide_play_button_from_reading_tab BOOLEAN NOT NULL DEFAULT FALSE;
