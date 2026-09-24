-- merge_user_progress: settle same-day ties the way the app now does.
--
-- Applied live 2026-09-24 (version 20260924111958). Written from randomised two-device tests of the reading-progress
-- merge (src/services/sync/syncMerge.progress.property.test.ts, 2026-09-24);
-- The app does not depend on it: its own merge already
-- resolves these ties before it uploads, so devices converge with or without it.
-- This keeps the server in step for two uploads that race each other.
--
-- 1. Streak on a same-day tie. Both sides last read on the same day with
--    different streaks: the upload won, so two devices syncing in turn replaced
--    each other's streak on every sync. The longer run now wins, as in
--    mergeReadingSnapshot.
-- 2. Reading position on a timestamp tie. Two positions whose chapters were read
--    at the same instant: the upload won. The same deterministic pick as the app
--    (the greater "BOOK_N" string) now wins.
-- 3. A last_read_date shaped like a date but not one ('2026-02-30') raised the
--    cast's 22008; it now raises 22023 like every other malformed field. The app
--    no longer sends one (buildRemoteProgressPayload).
--
-- Everything else is identical to 20260924051658. CREATE OR REPLACE keeps the
-- grants; they are restated for a fresh database. Backward compatible: same
-- signature and accepted payloads; installed builds do not call this function.

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
  -- Shaped like a date but not one ('2026-02-30'): the same 22023 as any other
  -- malformed field, rather than the cast's 22008.
  BEGIN
    v_in_last := (p_progress ->> 'last_read_date')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'last_read_date must be a calendar date' USING ERRCODE = '22023';
  END;

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
    -- Both sides last read on the same day: the longer run (each device only
    -- counts the days it saw). Before, the upload won, so two devices that
    -- reached the server in turn kept replacing each other's streak.
    WHEN v_in_last IS NOT NULL AND v_in_last = v_stored.last_read_date
      THEN GREATEST(COALESCE(v_in_streak, 0), COALESCE(v_stored.streak_days, 0))
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
      -- Read at the same instant: the same pick the app makes (by position,
      -- compared bytewise like JavaScript strings), so neither side keeps
      -- replacing the other.
      IF NOT (
        (v_in_book = 'GEN' AND v_in_chapter = 1 AND v_in_chapters = '{}'::jsonb)
        OR v_stored_ts > v_in_ts
        OR (
          v_stored_ts = v_in_ts
          AND (v_stored.current_book || '_' || v_stored.current_chapter) COLLATE "C"
            > (v_in_book || '_' || v_in_chapter) COLLATE "C"
        )
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
  'unioned, latest read date and its streak kept, same-day ties to the longer streak) and '
  'returns the stored row. A payload naming another account is refused (42501).';

REVOKE ALL ON FUNCTION public.merge_user_progress(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_user_progress(jsonb) TO authenticated;
