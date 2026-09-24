-- merge_reading_plan_progress: judge a new enrolment's start by the server's clock.
--
-- NOT APPLIED. Written from randomised failure-injection tests of reading-plan
-- sync (2026-09-24); review before applying. The app works with or without it:
-- an older server ignores the new key, and the app already follows whatever the
-- server decides.
--
-- The defect. started_at is stamped by the phone. A phone whose clock runs ahead
-- joins a plan offline, the reader leaves the plan on another phone, and the
-- first phone then pushes its enrolment. skip_ended_reading_plan_progress
-- (20260924023340) compares that started_at with the leave: the fast clock puts
-- the start after the leave, and clamping it to now() (the push, which also comes
-- after the leave) does not help, so the enrolment the reader left is taken for a
-- re-join and comes back on every phone.
--
-- The fix. With a row the app may send client_clock_at: the phone's clock at the
-- moment it sends the request. The gap between that and the server's now() is the
-- phone's clock error plus the request's travel time, so
--   started_at + (now() - client_clock_at)
-- is the enrolment's start on the server's clock (at most the travel time late).
-- The proposed row carries the corrected start, so the tombstone trigger judges
-- the real order of join and leave, and a new row stores a start that later
-- tombstone checks can compare directly. The same correction also rescues a
-- genuine re-join from a phone whose clock runs slow.
--
-- The app sends client_clock_at only for a plan that has a tombstone and no
-- stored row when it pushes: the only case where the start decides anything, and
-- one where the start is known to be on the phone's clock (a start the phone
-- adopted from the server is already on the server's clock and must not be
-- shifted again). A phone whose clock was changed between joining and pushing
-- is still judged by its current error.
--
-- Rows without client_clock_at (installed builds, and every other push) are
-- merged exactly as before. client_clock_at must be a timestamp string or null;
-- anything else is 22023 (a malformed timestamp string fails the cast, 22007).
--
-- Everything else is identical to 20260924051658. CREATE OR REPLACE keeps the
-- grants; they are restated for a fresh database. Backward compatible: same
-- signature; jsonb_to_recordset on the old definition ignores the extra key.

CREATE OR REPLACE FUNCTION public.merge_reading_plan_progress(p_rows jsonb)
RETURNS SETOF public.user_reading_plan_progress
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'merge_reading_plan_progress requires a signed-in user'
      USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'p_rows holds more than 100 plans' USING ERRCODE = '22023';
  END IF;

  -- Rows written for another account (the session changed mid-request).
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS item(value)
    WHERE jsonb_typeof(item.value) = 'object'
      AND COALESCE(jsonb_typeof(item.value -> 'user_id'), 'null') <> 'null'
      AND lower(item.value ->> 'user_id') IS DISTINCT FROM v_user_id::text
  ) THEN
    RAISE EXCEPTION 'p_rows holds progress for another account' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
      OR jsonb_typeof(item.value -> 'plan_slug') IS DISTINCT FROM 'string'
      OR char_length(btrim(item.value ->> 'plan_slug')) NOT BETWEEN 1 AND 200
      OR COALESCE(jsonb_typeof(item.value -> 'completed_entries'), 'null') NOT IN ('object', 'null')
      OR COALESCE(jsonb_typeof(item.value -> 'completed_sessions'), 'null') NOT IN ('object', 'null')
      OR COALESCE(jsonb_typeof(item.value -> 'client_clock_at'), 'null') NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION 'each row needs a plan_slug and object-valued completed_entries/completed_sessions'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT btrim(item.value ->> 'plan_slug'))
    FROM jsonb_array_elements(p_rows) AS item(value)
  ) <> jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'p_rows names a plan_slug more than once' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH incoming AS (
    SELECT
      btrim(r.plan_slug) AS plan_slug,
      r.plan_id,
      -- The phone's start moved onto the server's clock when the phone says what
      -- its clock read as it sent this row.
      CASE
        WHEN r.started_at IS NULL THEN now()
        WHEN r.client_clock_at IS NULL THEN r.started_at
        ELSE r.started_at + (now() - r.client_clock_at)
      END AS started_at,
      COALESCE(r.completed_entries, '{}'::jsonb) AS completed_entries,
      COALESCE(r.completed_sessions, '{}'::jsonb) AS completed_sessions,
      GREATEST(COALESCE(r.current_day, 1), 1) AS current_day,
      r.current_session,
      COALESCE(r.is_completed, false) AS is_completed,
      r.completed_at
    FROM jsonb_to_recordset(p_rows) AS r(
      plan_slug text,
      plan_id uuid,
      started_at timestamptz,
      completed_entries jsonb,
      completed_sessions jsonb,
      current_day integer,
      current_session text,
      is_completed boolean,
      completed_at timestamptz,
      client_clock_at timestamptz
    )
  ),
  written AS (
    INSERT INTO public.user_reading_plan_progress AS stored (
      user_id, plan_id, plan_slug, started_at, completed_entries, completed_sessions,
      current_day, current_session, is_completed, completed_at, synced_at
    )
    SELECT
      v_user_id, incoming.plan_id, incoming.plan_slug, incoming.started_at,
      incoming.completed_entries, incoming.completed_sessions, incoming.current_day,
      incoming.current_session, incoming.is_completed, incoming.completed_at, now()
    FROM incoming
    ON CONFLICT (user_id, plan_slug) DO UPDATE SET
      plan_id = COALESCE(EXCLUDED.plan_id, stored.plan_id),
      completed_entries =
        (CASE WHEN jsonb_typeof(stored.completed_entries) = 'object'
          THEN stored.completed_entries ELSE '{}'::jsonb END)
        || EXCLUDED.completed_entries,
      completed_sessions =
        (CASE WHEN jsonb_typeof(stored.completed_sessions) = 'object'
          THEN stored.completed_sessions ELSE '{}'::jsonb END)
        || EXCLUDED.completed_sessions,
      current_day = GREATEST(COALESCE(stored.current_day, 1), EXCLUDED.current_day),
      current_session = CASE
        WHEN COALESCE(stored.current_day, 1) > EXCLUDED.current_day THEN stored.current_session
        WHEN EXCLUDED.current_day > COALESCE(stored.current_day, 1) THEN EXCLUDED.current_session
        ELSE COALESCE(EXCLUDED.current_session, stored.current_session)
      END,
      is_completed = COALESCE(stored.is_completed, false) OR EXCLUDED.is_completed,
      completed_at = COALESCE(EXCLUDED.completed_at, stored.completed_at),
      synced_at = now()
    RETURNING stored.*
  )
  SELECT * FROM written;
END;
$$;

COMMENT ON FUNCTION public.merge_reading_plan_progress(jsonb) IS
  'Atomically merges the caller''s reading-plan progress rows into user_reading_plan_progress '
  '(completed days/sessions unioned, furthest day kept) and returns the stored rows. Rows '
  'naming another account are refused (42501). A row''s optional client_clock_at (the '
  'sender''s clock when it sent the row) moves its started_at onto the server''s clock.';

REVOKE ALL ON FUNCTION public.merge_reading_plan_progress(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_reading_plan_progress(jsonb) TO authenticated;
