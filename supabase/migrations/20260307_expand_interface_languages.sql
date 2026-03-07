ALTER TABLE public.user_preferences
DROP CONSTRAINT IF EXISTS user_preferences_language_check;

ALTER TABLE public.user_preferences
ADD CONSTRAINT user_preferences_language_check
CHECK (
  language IN (
    'en', 'zh', 'hi', 'es', 'ar', 'fr', 'bn', 'pt', 'ru', 'ur', 'id', 'de', 'ja', 'pa',
    'mr', 'te', 'tr', 'ta', 'vi', 'ko', 'ne'
  )
);
