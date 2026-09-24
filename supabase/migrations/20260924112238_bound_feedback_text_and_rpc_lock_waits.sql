-- Input backstops requested by the edge-function hardening pass (2026-09-24).
--
-- 1. Length backstop on chapter_feedback_submissions short text columns.
--
--    submit-chapter-feedback validates presence and caps participant name/role at 120
--    characters, but the identifier, locale, screen, platform and version fields go to the
--    table unbounded, and anon/authenticated still hold table-level INSERT/UPDATE (RLS is the
--    only gate). One CHECK in the style of analytics_events_text_bounded caps each at 128.
--    NULLs pass (char_length(NULL) <= 128 is NULL), so optional columns stay optional.
--
--    Live max lengths (read-only, 2026-09-24, 25 rows): translation_id 3,
--    translation_language 7, interface_language 2, content_language_code 3,
--    content_language_name 34, book_id 3, source_screen 8, app_platform 7, app_version 5,
--    participant_name 12, participant_role 11, participant_id_number 36. The longest catalog
--    translation_id is 17 characters. No row is near the bound.
--
--    Added NOT VALID then validated in the same migration: the ADD holds ACCESS EXCLUSIVE only
--    for the catalog update, VALIDATE scans the 25 rows under SHARE UPDATE EXCLUSIVE.
--
--    Deliberately not bounded here: comment and scripture_council_fixed_note (already
--    checked at 2000 / 1000), audio_response_path (server-built storage path), client_ip_hash
--    (server-computed digest), export_error (server-written diagnostics).
--
-- 2. Bound lock waits in the three service-only RPCs the edge functions call per request.
--
--    The request asked for SET statement_timeout on the function definitions. That would be a
--    no-op: Postgres arms the statement timer when the client statement starts, and a
--    function's SET clause changes the GUC only after that, so it never shortens the running
--    call. Verified live (read-only): with the 2 min timer already armed, lowering
--    statement_timeout to 100ms mid-statement did not interrupt a 600 ms pg_sleep. These calls
--    already get statement_timeout = 8s and lock_timeout = 8s from the authenticator role that
--    PostgREST connects as (service_role has no role settings).
--
--    lock_timeout is different: it is read each time a lock wait starts, so a function-level
--    value does apply. Lock waits are how these functions can stall:
--      * consume_analytics_ingest_budget: every caller that may claim a geo lookup upserts the
--        single hot row 'global:geo-lookups';
--      * consume_app_error_ingest_budget: same pattern with its global report counter;
--      * claim_group_session_notification: pg_advisory_xact_lock per group.
--    A 2 s cap fails a stuck call fast instead of holding an edge worker for 8 s. The callers
--    already treat an RPC error safely: analytics ingest fails open without the paid geo
--    lookup, app-error ingest reports "unavailable", and send-group-notification returns an
--    error without recording a claim (its transaction rolls back), so the sender can retry.
--
-- Risk: low. The CHECK cannot fail validation on current data; a future client sending a
-- >128-character value gets a 23514 error instead of a stored row. The function change only
-- shortens how long a contended call waits.
--
-- Rollback:
--   ALTER TABLE public.chapter_feedback_submissions
--     DROP CONSTRAINT IF EXISTS chapter_feedback_submissions_text_bounded;
--   ALTER FUNCTION public.consume_analytics_ingest_budget(text, integer, integer, integer, integer, integer, integer, integer, integer) RESET lock_timeout;
--   ALTER FUNCTION public.consume_app_error_ingest_budget(text, integer, integer, integer, integer, integer, integer, integer) RESET lock_timeout;
--   ALTER FUNCTION public.claim_group_session_notification(uuid, uuid, uuid) RESET lock_timeout;

SET lock_timeout = '5s';

ALTER TABLE public.chapter_feedback_submissions
  DROP CONSTRAINT IF EXISTS chapter_feedback_submissions_text_bounded;

ALTER TABLE public.chapter_feedback_submissions
  ADD CONSTRAINT chapter_feedback_submissions_text_bounded CHECK (
    char_length(translation_id) <= 128
    AND char_length(translation_language) <= 128
    AND char_length(interface_language) <= 128
    AND char_length(content_language_code) <= 128
    AND char_length(content_language_name) <= 128
    AND char_length(book_id) <= 128
    AND char_length(source_screen) <= 128
    AND char_length(app_platform) <= 128
    AND char_length(app_version) <= 128
    AND char_length(participant_name) <= 128
    AND char_length(participant_role) <= 128
    AND char_length(participant_id_number) <= 128
  ) NOT VALID;

ALTER TABLE public.chapter_feedback_submissions
  VALIDATE CONSTRAINT chapter_feedback_submissions_text_bounded;

ALTER FUNCTION public.consume_analytics_ingest_budget(text, integer, integer, integer, integer, integer, integer, integer, integer)
  SET lock_timeout = '2s';
ALTER FUNCTION public.consume_app_error_ingest_budget(text, integer, integer, integer, integer, integer, integer, integer)
  SET lock_timeout = '2s';
ALTER FUNCTION public.claim_group_session_notification(uuid, uuid, uuid)
  SET lock_timeout = '2s';
