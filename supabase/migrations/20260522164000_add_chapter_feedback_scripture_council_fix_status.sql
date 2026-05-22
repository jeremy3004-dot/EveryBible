ALTER TABLE public.chapter_feedback_submissions
ADD COLUMN IF NOT EXISTS scripture_council_fixed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scripture_council_fixed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS scripture_council_fixed_note TEXT;

ALTER TABLE public.chapter_feedback_submissions
DROP CONSTRAINT IF EXISTS chapter_feedback_scripture_council_fixed_note_check;

ALTER TABLE public.chapter_feedback_submissions
ADD CONSTRAINT chapter_feedback_scripture_council_fixed_note_check
CHECK (
  scripture_council_fixed_note IS NULL
  OR char_length(trim(scripture_council_fixed_note)) BETWEEN 1 AND 1000
);

CREATE INDEX IF NOT EXISTS idx_chapter_feedback_scripture_council_open
  ON public.chapter_feedback_submissions (translation_id, book_id, chapter, created_at DESC)
  WHERE sentiment = 'down' AND scripture_council_fixed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chapter_feedback_scripture_council_fixed_at
  ON public.chapter_feedback_submissions (scripture_council_fixed_at DESC)
  WHERE scripture_council_fixed_at IS NOT NULL;
