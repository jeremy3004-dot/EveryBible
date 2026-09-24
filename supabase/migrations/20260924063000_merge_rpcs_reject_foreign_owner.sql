-- A merge payload that names another account is refused
-- (follow-up to 20260924035821 and 20260924041000, from the 2026-09-24
-- auth/sync review).
--
-- merge_user_progress and merge_reading_plan_progress write to auth.uid() and
-- ignored any user_id in the payload. When the session switches accounts while
-- a push is in flight, the request can carry the new account's token and the
-- old account's data, and that data merged into the new account. Now the
-- payload (merge_user_progress) and every row (merge_reading_plan_progress)
-- that carries a non-null user_id must name the caller, or the whole call
-- fails with 42501 and writes nothing. A payload without user_id (or with null)
-- is still accepted. The app sends user_id and treats 42501 as "drop this push
-- and re-read", never as a reason to fall back to the plain upsert.
--
-- Checked and left unchanged: a stale phone pushing the enrolment the reader
-- left, after they re-joined. The merge keeps the stored (re-joined) started_at
-- on a conflict, but INSERT ... ON CONFLICT fires the BEFORE INSERT trigger
-- skip_ended_reading_plan_progress (20260924023340) on the proposed row first,
-- with the started_at the stale phone sent; it returns NULL and the row never
-- reaches the conflict. scripts/verify-sync-contract-sql.mjs pins this.
--
-- Everything else in both functions is identical to the live definitions
-- (pg_get_functiondef, 2026-09-24). CREATE OR REPLACE keeps the grants
-- (EXECUTE for authenticated only); they are restated for a fresh database.
--
-- Backward compatibility: installed store builds do not call these functions
-- (they use the plain upsert, still governed by RLS). Builds that do call them
-- already send user_id = the signed-in account, which is accepted.

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
  '(completed days/sessions unioned, furthest day kept) and returns the stored rows. Rows '
  'naming another account are refused (42501).';

REVOKE ALL ON FUNCTION public.merge_reading_plan_progress(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_reading_plan_progress(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_user_progress(p_progress jsonb)
RETURNS SETOF public.user_progress
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_in_chapters jsonb;
  v_in_streak integer;
  v_in_last date;
  v_in_book text;
  v_in_chapter integer;
  v_stored public.user_progress;
  v_chapters jsonb;
  v_streak integer;
  v_last date;
  v_book text;
  v_chapter integer;
  v_stored_ts numeric;
  v_in_ts numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'merge_user_progress requires a signed-in user' USING ERRCODE = '42501';
  END IF;

  IF p_progress IS NULL OR jsonb_typeof(p_progress) <> 'object' THEN
    RAISE EXCEPTION 'p_progress must be a JSON object' USING ERRCODE = '22023';
  END IF;

  -- Progress written for another account (the session changed mid-request).
  IF COALESCE(jsonb_typeof(p_progress -> 'user_id'), 'null') <> 'null'
    AND lower(p_progress ->> 'user_id') IS DISTINCT FROM v_user_id::text THEN
    RAISE EXCEPTION 'p_progress is progress for another account' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(jsonb_typeof(p_progress -> 'chapters_read'), 'null') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'chapters_read must be an object' USING ERRCODE = '22023';
  END IF;
  v_in_chapters := COALESCE(NULLIF(p_progress -> 'chapters_read', 'null'::jsonb), '{}'::jsonb);
  IF (SELECT count(*) FROM jsonb_object_keys(v_in_chapters)) > 5000 THEN
    RAISE EXCEPTION 'chapters_read holds more than 5000 chapters' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_each(v_in_chapters) AS entry(key, value)
    WHERE jsonb_typeof(entry.value) <> 'number'
      OR char_length(entry.key) NOT BETWEEN 1 AND 64
  ) THEN
    RAISE EXCEPTION 'chapters_read values must be numbers under keys of 1-64 characters'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(jsonb_typeof(p_progress -> 'streak_days'), 'null') NOT IN ('number', 'null')
    OR (p_progress ->> 'streak_days') !~ '^[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'streak_days must be a non-negative integer' USING ERRCODE = '22023';
  END IF;
  v_in_streak := (p_progress ->> 'streak_days')::integer;

  IF COALESCE(jsonb_typeof(p_progress -> 'last_read_date'), 'null') NOT IN ('string', 'null')
    OR (p_progress ->> 'last_read_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'last_read_date must be YYYY-MM-DD' USING ERRCODE = '22023';
  END IF;
  v_in_last := (p_progress ->> 'last_read_date')::date;

  IF COALESCE(jsonb_typeof(p_progress -> 'current_book'), 'null') NOT IN ('string', 'null')
    OR char_length(p_progress ->> 'current_book') NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'current_book must be a string of 1-32 characters' USING ERRCODE = '22023';
  END IF;
  v_in_book := p_progress ->> 'current_book';

  IF COALESCE(jsonb_typeof(p_progress -> 'current_chapter'), 'null') NOT IN ('number', 'null')
    OR (p_progress ->> 'current_chapter') !~ '^[0-9]{1,6}$' THEN
    RAISE EXCEPTION 'current_chapter must be a non-negative integer' USING ERRCODE = '22023';
  END IF;
  v_in_chapter := (p_progress ->> 'current_chapter')::integer;

  INSERT INTO public.user_progress (
    user_id, chapters_read, streak_days, last_read_date, current_book, current_chapter, synced_at
  )
  VALUES (
    v_user_id, v_in_chapters, COALESCE(v_in_streak, 0), v_in_last,
    COALESCE(v_in_book, 'GEN'), COALESCE(v_in_chapter, 1), now()
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_stored;
  IF FOUND THEN
    RETURN NEXT v_stored;
    RETURN;
  END IF;

  SELECT * INTO v_stored
  FROM public.user_progress
  WHERE user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(jsonb_object_agg(merged.key, merged.read_at), '{}'::jsonb)
  INTO v_chapters
  FROM (
    SELECT pair.key, max((pair.value)::numeric) AS read_at
    FROM (
      SELECT stored.key, stored.value
      FROM jsonb_each(
        CASE WHEN jsonb_typeof(v_stored.chapters_read) = 'object'
          THEN v_stored.chapters_read ELSE '{}'::jsonb END
      ) AS stored(key, value)
      UNION ALL
      SELECT uploaded.key, uploaded.value
      FROM jsonb_each(v_in_chapters) AS uploaded(key, value)
    ) AS pair
    WHERE jsonb_typeof(pair.value) = 'number'
    GROUP BY pair.key
  ) AS merged;

  v_last := GREATEST(v_stored.last_read_date, v_in_last);
  v_streak := CASE
    WHEN v_last IS NOT DISTINCT FROM v_stored.last_read_date
      AND v_last IS DISTINCT FROM v_in_last
      THEN COALESCE(v_stored.streak_days, 0)
    ELSE COALESCE(v_in_streak, v_stored.streak_days, 0)
  END;

  v_book := v_stored.current_book;
  v_chapter := v_stored.current_chapter;
  IF v_in_book IS NOT NULL AND v_in_chapter IS NOT NULL THEN
    IF COALESCE(v_stored.current_book, '') = '' OR COALESCE(v_stored.current_chapter, 0) = 0 THEN
      v_book := v_in_book;
      v_chapter := v_in_chapter;
    ELSE
      v_stored_ts := COALESCE(
        NULLIF((v_chapters ->> (v_stored.current_book || '_' || v_stored.current_chapter))::numeric, 0),
        extract(epoch FROM v_stored.synced_at) * 1000,
        0
      );
      v_in_ts := COALESCE((v_chapters ->> (v_in_book || '_' || v_in_chapter))::numeric, 0);
      IF NOT (
        (v_in_book = 'GEN' AND v_in_chapter = 1 AND v_in_chapters = '{}'::jsonb)
        OR v_stored_ts > v_in_ts
      ) THEN
        v_book := v_in_book;
        v_chapter := v_in_chapter;
      END IF;
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.user_progress AS progress
  SET chapters_read = v_chapters,
      streak_days = v_streak,
      last_read_date = v_last,
      current_book = v_book,
      current_chapter = v_chapter,
      synced_at = now()
  WHERE progress.id = v_stored.id
  RETURNING progress.*;
END;
$$;

COMMENT ON FUNCTION public.merge_user_progress(jsonb) IS
  'Atomically merges the caller''s reading progress into user_progress (chapters read '
  'unioned, latest read date and its streak kept) and returns the stored row. A payload '
  'naming another account is refused (42501).';

REVOKE ALL ON FUNCTION public.merge_user_progress(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_user_progress(jsonb) TO authenticated;
