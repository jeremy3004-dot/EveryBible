ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS chapter_feedback_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.chapter_feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  translation_id TEXT NOT NULL,
  translation_language TEXT NOT NULL,
  interface_language TEXT NOT NULL,
  content_language_code TEXT,
  content_language_name TEXT,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL CHECK (chapter >= 1),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('up', 'down')),
  comment TEXT NULL CHECK (comment IS NULL OR char_length(trim(comment)) BETWEEN 1 AND 2000),
  source_screen TEXT NOT NULL DEFAULT 'reader',
  app_platform TEXT,
  app_version TEXT,
  export_status TEXT NOT NULL DEFAULT 'pending' CHECK (export_status IN ('pending', 'exported', 'failed')),
  exported_at TIMESTAMPTZ,
  export_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chapter_feedback_language_book_chapter_created_at
  ON public.chapter_feedback_submissions (translation_language, book_id, chapter, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chapter_feedback_export_status_created_at
  ON public.chapter_feedback_submissions (export_status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chapter_feedback_user_created_at
  ON public.chapter_feedback_submissions (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.chapter_feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_chapter_feedback_submissions_updated_at
  ON public.chapter_feedback_submissions;

CREATE TRIGGER update_chapter_feedback_submissions_updated_at
  BEFORE UPDATE ON public.chapter_feedback_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
