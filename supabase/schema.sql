-- Every Bible Database Schema
-- Run this in your Supabase SQL Editor

-- Profiles table (auto-created on signup)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Progress (reading history)
CREATE TABLE IF NOT EXISTS public.user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  chapters_read JSONB DEFAULT '{}',
  streak_days INTEGER DEFAULT 0,
  last_read_date DATE,
  current_book TEXT DEFAULT 'GEN',
  current_chapter INTEGER DEFAULT 1,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  font_size TEXT DEFAULT 'medium',
  theme TEXT DEFAULT 'dark',
  appearance_palette TEXT NOT NULL DEFAULT 'ember' CHECK (
    appearance_palette IN ('ember', 'sapphire', 'teal', 'olive')
  ),
  language TEXT DEFAULT 'en' CHECK (
    language IN (
      'en', 'zh', 'hi', 'es', 'ar', 'fr', 'bn', 'pt', 'ru', 'ur', 'id', 'de', 'ja', 'pa',
      'mr', 'te', 'tr', 'ta', 'vi', 'ko', 'ne'
    )
  ),
  country_code TEXT,
  country_name TEXT,
  content_language_code TEXT,
  content_language_name TEXT,
  content_language_native_name TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  notifications_enabled BOOLEAN DEFAULT false,
  reminder_time TIME,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- User Progress policies
CREATE POLICY "Users can view own progress" ON public.user_progress
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own progress" ON public.user_progress
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own progress" ON public.user_progress
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- User Preferences policies
CREATE POLICY "Users can view own preferences" ON public.user_preferences
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own preferences" ON public.user_preferences
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Create default progress
  INSERT INTO public.user_progress (user_id)
  VALUES (NEW.id);

  -- Create default preferences
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Trigger to call function on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update profile timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Trigger for profile updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON public.user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 80),
  join_code TEXT NOT NULL UNIQUE CHECK (join_code ~ '^[A-Z0-9]{6}$'),
  leader_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  current_course_id TEXT NOT NULL DEFAULT 'entry-course',
  current_lesson_id TEXT NOT NULL DEFAULT 'entry-1',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  notes JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view groups" ON public.groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.group_members members
      WHERE members.group_id = groups.id
        AND members.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Leaders can create groups" ON public.groups
  FOR INSERT WITH CHECK (leader_id = (select auth.uid()));

CREATE POLICY "Leaders can update groups" ON public.groups
  FOR UPDATE USING (leader_id = (select auth.uid()))
  WITH CHECK (leader_id = (select auth.uid()));

CREATE POLICY "Leaders can delete groups" ON public.groups
  FOR DELETE USING (leader_id = (select auth.uid()));

CREATE POLICY "Group members can view membership" ON public.group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.group_members visible_members
      WHERE visible_members.group_id = group_members.group_id
        AND visible_members.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can join groups as themselves" ON public.group_members
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users and leaders can leave groups" ON public.group_members
  FOR DELETE USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.groups managed_groups
      WHERE managed_groups.id = group_members.group_id
        AND managed_groups.leader_id = (select auth.uid())
    )
  );

CREATE POLICY "Leaders can update membership" ON public.group_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.groups managed_groups
      WHERE managed_groups.id = group_members.group_id
        AND managed_groups.leader_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.groups managed_groups
      WHERE managed_groups.id = group_members.group_id
        AND managed_groups.leader_id = (select auth.uid())
    )
  );

CREATE POLICY "Group members can view sessions" ON public.group_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.group_members members
      WHERE members.group_id = group_sessions.group_id
        AND members.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Group members can insert sessions" ON public.group_sessions
  FOR INSERT WITH CHECK (
    created_by = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.group_members members
      WHERE members.group_id = group_sessions.group_id
        AND members.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Session creators can update sessions" ON public.group_sessions
  FOR UPDATE USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.join_group_by_code(group_join_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requesting_user_id UUID := auth.uid();
  matched_group_id UUID;
BEGIN
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id
  INTO matched_group_id
  FROM public.groups
  WHERE join_code = UPPER(TRIM(group_join_code))
    AND archived_at IS NULL
  LIMIT 1;

  IF matched_group_id IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (matched_group_id, requesting_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN matched_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_group(target_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requesting_user_id UUID := auth.uid();
  promoted_leader_id UUID;
BEGIN
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = target_group_id
      AND user_id = requesting_user_id
  ) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = target_group_id
    AND user_id = requesting_user_id;

  SELECT user_id
  INTO promoted_leader_id
  FROM public.group_members
  WHERE group_id = target_group_id
  ORDER BY CASE WHEN role = 'leader' THEN 0 ELSE 1 END, joined_at ASC
  LIMIT 1;

  IF promoted_leader_id IS NULL THEN
    DELETE FROM public.groups WHERE id = target_group_id;
    RETURN;
  END IF;

  UPDATE public.group_members
  SET role = CASE WHEN user_id = promoted_leader_id THEN 'leader' ELSE 'member' END
  WHERE group_id = target_group_id;

  UPDATE public.groups
  SET leader_id = promoted_leader_id,
      updated_at = NOW()
  WHERE id = target_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_group_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_groups_updated_at ON public.groups;
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_group_timestamp();

CREATE INDEX IF NOT EXISTS idx_groups_join_code ON public.groups(join_code);
CREATE INDEX IF NOT EXISTS idx_groups_leader_id ON public.groups(leader_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_sessions_group_id ON public.group_sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_sessions_created_by ON public.group_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_group_sessions_completed_at ON public.group_sessions(completed_at DESC);

GRANT EXECUTE ON FUNCTION public.join_group_by_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;

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
