-- Add private audio-message support for chapter feedback responses.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chapter-feedback-audio',
  'chapter-feedback-audio',
  false,
  5242880,
  ARRAY['audio/mp4']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chapter_feedback_audio_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chapter-feedback-audio'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "chapter_feedback_audio_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chapter-feedback-audio'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "chapter_feedback_audio_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chapter-feedback-audio'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "chapter_feedback_audio_service_role_select"
  ON storage.objects FOR SELECT TO service_role
  USING (bucket_id = 'chapter-feedback-audio');

ALTER TABLE public.chapter_feedback_submissions
ADD COLUMN IF NOT EXISTS audio_response_bucket TEXT,
ADD COLUMN IF NOT EXISTS audio_response_path TEXT,
ADD COLUMN IF NOT EXISTS audio_response_mime_type TEXT,
ADD COLUMN IF NOT EXISTS audio_response_size_bytes INTEGER,
ADD COLUMN IF NOT EXISTS audio_response_duration_ms INTEGER,
ADD COLUMN IF NOT EXISTS audio_response_created_at TIMESTAMPTZ,
ADD CONSTRAINT chapter_feedback_audio_response_bucket_check
  CHECK (
    audio_response_bucket IS NULL
    OR audio_response_bucket = 'chapter-feedback-audio'
  ),
ADD CONSTRAINT chapter_feedback_audio_response_mime_type_check
  CHECK (
    audio_response_mime_type IS NULL
    OR audio_response_mime_type = 'audio/mp4'
  ),
ADD CONSTRAINT chapter_feedback_audio_response_size_check
  CHECK (
    audio_response_size_bytes IS NULL
    OR audio_response_size_bytes BETWEEN 1 AND 5242880
  ),
ADD CONSTRAINT chapter_feedback_audio_response_duration_check
  CHECK (
    audio_response_duration_ms IS NULL
    OR audio_response_duration_ms BETWEEN 500 AND 120000
  ),
ADD CONSTRAINT chapter_feedback_audio_response_metadata_check
  CHECK (
    (
      audio_response_bucket IS NULL
      AND audio_response_path IS NULL
      AND audio_response_mime_type IS NULL
      AND audio_response_size_bytes IS NULL
      AND audio_response_duration_ms IS NULL
      AND audio_response_created_at IS NULL
    )
    OR (
      audio_response_bucket IS NOT NULL
      AND audio_response_path IS NOT NULL
      AND audio_response_mime_type IS NOT NULL
      AND audio_response_duration_ms IS NOT NULL
      AND audio_response_created_at IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_chapter_feedback_audio_response_created_at
  ON public.chapter_feedback_submissions (audio_response_created_at DESC)
  WHERE audio_response_path IS NOT NULL;
