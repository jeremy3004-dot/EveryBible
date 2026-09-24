-- Two phones syncing the same reading plan at the same moment must not erase
-- each other's completed days (docs/research/sync-offline-review-2026-09-24.md,
-- finding 12, plan half).
--
-- The app merges plan progress read-modify-write: it reads the server row,
-- folds it into its own, and upserts the result, which REPLACES
-- completed_entries / completed_sessions. Two devices that read the same row
-- before either writes both upload "that row + my days", and the second write
-- drops the first device's new days until that device syncs again.
--
-- merge_reading_plan_progress(p_rows) does the merge inside one
-- INSERT ... ON CONFLICT DO UPDATE. Postgres locks the conflicting row and
-- evaluates the SET list against its latest committed version, so concurrent
-- calls serialise on the row and each one merges into what the other wrote.
-- The rules are the client's mergePlanProgress (src/services/plans/readingPlanModel.ts)
-- with the uploaded row as "local" and the stored row as "remote":
--   completed_entries, completed_sessions  union (uploaded value wins a shared key)
--   current_day                            the higher of the two
--   current_session                        from the side further through the plan;
--                                          on the same day, uploaded ?? stored
--   is_completed                           either side
--   completed_at                           uploaded ?? stored
--   started_at                             stored (the enrolment the row belongs to)
--   synced_at                              the server's now()
-- Completed days and ticks are only ever added by the app, so a union never
-- keeps something a reader removed.
--
-- SECURITY INVOKER: the write runs as the caller, so the existing own-row RLS
-- policies and the unenrol-tombstone trigger (20260924023340) apply exactly as
-- they do to the plain upsert; an ended enrolment is skipped and not returned.
-- The row owner is always auth.uid(); any user_id in the payload is ignored.
--
-- Backward compatibility: additive (one function). Installed builds keep using
-- the plain upsert. New clients call this function and fall back to the upsert
-- when PostgREST reports it missing (PGRST202), so the app works before and
-- after this migration. Requires 20260924023342 (completed_sessions,
-- current_session).

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

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
      OR jsonb_typeof(item.value -> 'plan_slug') IS DISTINCT FROM 'string'
      OR char_length(btrim(item.value ->> 'plan_slug')) NOT BETWEEN 1 AND 200
      OR COALESCE(jsonb_typeof(item.value -> 'completed_entries'), 'null') NOT IN ('object', 'null')
      OR COALESCE(jsonb_typeof(item.value -> 'completed_sessions'), 'null') NOT IN ('object', 'null')
  ) THEN
    RAISE EXCEPTION 'each row needs a plan_slug and object-valued completed_entries/completed_sessions'
      USING ERRCODE = '22023';
  END IF;

  -- ON CONFLICT cannot touch one row twice in a statement.
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
      COALESCE(r.started_at, now()) AS started_at,
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
      completed_at timestamptz
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
  '(completed days/sessions unioned, furthest day kept) and returns the stored rows.';

REVOKE ALL ON FUNCTION public.merge_reading_plan_progress(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_reading_plan_progress(jsonb) TO authenticated;
