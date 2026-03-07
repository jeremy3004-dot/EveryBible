ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'
CHECK (
  language IN (
    'en', 'zh', 'hi', 'es', 'ar', 'fr', 'bn', 'pt', 'ru', 'ur', 'id', 'de', 'ja', 'pa',
    'mr', 'te', 'tr', 'ta', 'vi', 'ko', 'ne'
  )
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_progress (user_id)
  VALUES (NEW.id);

  INSERT INTO public.user_preferences (user_id, language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'language', 'en')
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requesting_user_id UUID := auth.uid();
BEGIN
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = requesting_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
