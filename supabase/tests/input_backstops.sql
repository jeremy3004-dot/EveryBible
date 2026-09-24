-- Input backstops from 20260924150200. Run against a local or linked database as
-- postgres; every fixture rolls back.
BEGIN;
SET LOCAL statement_timeout = '10s';

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.consume_analytics_ingest_budget(text, integer, integer, integer, integer, integer, integer, integer, integer)'::regprocedure,
    'public.consume_app_error_ingest_budget(text, integer, integer, integer, integer, integer, integer, integer)'::regprocedure,
    'public.claim_group_session_notification(uuid, uuid, uuid)'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc WHERE oid = fn AND 'lock_timeout=2s' = ANY (proconfig)
    ) THEN
      RAISE EXCEPTION '% must pin lock_timeout=2s', fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.chapter_feedback_submissions'::regclass
      AND conname = 'chapter_feedback_submissions_text_bounded'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'chapter_feedback_submissions_text_bounded must exist and be validated';
  END IF;
END;
$$;

-- A 129-character app_version is rejected; the same row at 128 characters is accepted.
DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.chapter_feedback_submissions
      (translation_id, translation_language, interface_language, book_id, chapter, sentiment,
       source_screen, export_status, contributor_category, app_version)
    VALUES ('bsb', 'English', 'en', 'GEN', 1, 'up', 'reader', 'pending', 'community', repeat('9', 129));
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'A 129-character app_version was accepted';
  END IF;

  INSERT INTO public.chapter_feedback_submissions
    (translation_id, translation_language, interface_language, book_id, chapter, sentiment,
     source_screen, export_status, contributor_category, app_version)
  VALUES ('bsb', 'English', 'en', 'GEN', 1, 'up', 'reader', 'pending', 'community', repeat('9', 128));
END;
$$;

SELECT 'PASS: feedback text columns are bounded and ingest RPCs cap lock waits' AS result;
ROLLBACK;
