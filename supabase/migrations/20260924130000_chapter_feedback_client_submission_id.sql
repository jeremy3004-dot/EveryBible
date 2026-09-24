-- Chapter feedback: an idempotency key so a retried submission is not stored twice.
--
-- The app's feedback outbox retries a submission whose request failed or timed out. A
-- request can be saved and still lose its response (a timeout on a slow village
-- connection), so the retry stored the same feedback a second time. The app now makes a
-- UUID once per submission and sends it as `clientSubmissionId` with every attempt;
-- submit-chapter-feedback writes it here and answers a unique violation on this column
-- (23505) with the row that is already saved, instead of an error.
--
-- Nullable on purpose: every row written before this, and every submission from a build
-- that does not send an id, has none. The unique index is partial, so any number of NULLs
-- coexist and only real ids are held to one row each.
--
-- Apply BEFORE deploying the matching submit-chapter-feedback. (The function also tolerates
-- the column being absent: on PGRST204 it saves the row without the id.)

ALTER TABLE public.chapter_feedback_submissions
  ADD COLUMN IF NOT EXISTS client_submission_id UUID NULL;

COMMENT ON COLUMN public.chapter_feedback_submissions.client_submission_id IS
  'Client-generated UUID sent with every attempt at one submission; a retry of an already '
  'saved submission is answered with the existing row. NULL for older app builds.';

CREATE UNIQUE INDEX IF NOT EXISTS chapter_feedback_submissions_client_submission_id_key
  ON public.chapter_feedback_submissions (client_submission_id)
  WHERE client_submission_id IS NOT NULL;
