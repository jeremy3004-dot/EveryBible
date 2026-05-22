CREATE INDEX IF NOT EXISTS idx_chapter_feedback_review_summary
  ON public.chapter_feedback_submissions (translation_id, book_id, chapter, created_at DESC);
