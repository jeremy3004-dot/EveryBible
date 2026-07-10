-- Phase 1 of the chapter-feedback revamp: give translator resolution a durable,
-- server-side home so mark-offs survive reinstalls, sync across devices, and become
-- visible to council members. Additive only — existing rows keep NULL resolution.

ALTER TABLE public.chapter_feedback_submissions
ADD COLUMN IF NOT EXISTS scripture_council_resolution TEXT;

ALTER TABLE public.chapter_feedback_submissions
DROP CONSTRAINT IF EXISTS chapter_feedback_scripture_council_resolution_check;

ALTER TABLE public.chapter_feedback_submissions
ADD CONSTRAINT chapter_feedback_scripture_council_resolution_check
CHECK (
  scripture_council_resolution IS NULL
  OR scripture_council_resolution IN ('fixed', 'no_change_needed')
);

-- Resolution and the fixed-at timestamp move together: either a row is fully resolved
-- (both set) or fully open (both NULL). Prevents half-written states from either the
-- edge function or a future admin surface.
ALTER TABLE public.chapter_feedback_submissions
DROP CONSTRAINT IF EXISTS chapter_feedback_scripture_council_resolution_consistency_check;

ALTER TABLE public.chapter_feedback_submissions
ADD CONSTRAINT chapter_feedback_scripture_council_resolution_consistency_check
CHECK (
  (scripture_council_resolution IS NULL AND scripture_council_fixed_at IS NULL)
  OR (scripture_council_resolution IS NOT NULL AND scripture_council_fixed_at IS NOT NULL)
);

-- Supports the per-chapter unresolved-count aggregation the review summary now runs
-- server-side (open items across both sentiments, grouped by chapter).
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_scripture_council_unresolved
  ON public.chapter_feedback_submissions (translation_id, book_id, chapter)
  WHERE scripture_council_resolution IS NULL;
