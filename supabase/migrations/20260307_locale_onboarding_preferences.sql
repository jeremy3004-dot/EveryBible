ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS country_name TEXT,
ADD COLUMN IF NOT EXISTS content_language_code TEXT,
ADD COLUMN IF NOT EXISTS content_language_name TEXT,
ADD COLUMN IF NOT EXISTS content_language_native_name TEXT,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
