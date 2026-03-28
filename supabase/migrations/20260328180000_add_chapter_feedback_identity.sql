ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS chapter_feedback_name TEXT,
ADD COLUMN IF NOT EXISTS chapter_feedback_role TEXT,
ADD COLUMN IF NOT EXISTS chapter_feedback_id_number TEXT;

ALTER TABLE public.chapter_feedback_submissions
ADD COLUMN IF NOT EXISTS participant_name TEXT,
ADD COLUMN IF NOT EXISTS participant_role TEXT,
ADD COLUMN IF NOT EXISTS participant_id_number TEXT;
