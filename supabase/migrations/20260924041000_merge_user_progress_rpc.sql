-- Two devices syncing reading progress at the same moment must not erase each
-- other's chapters (docs/research/sync-offline-review-2026-09-24.md, finding 12,
-- user_progress half).
--
-- The app merges user_progress read-modify-write: it reads the server row, folds
-- it into its own, and upserts the result, which REPLACES chapters_read. Two
-- devices that read the same row before either writes both upload "that row +
-- my chapters", and the second write drops the first device's new chapters
-- until that device syncs again.
--
-- merge_user_progress(p_progress) does the merge on the server, holding the row
-- lock (SELECT ... FOR UPDATE), so concurrent calls serialise on the row and each
-- one merges into what the other wrote. The rules are the client's
-- mergeReadingSnapshot (src/services/sync/syncMerge.ts) with the uploaded row as
-- "local" and the stored row as "remote":
--   chapters_read     union; a chapter in both keeps the later timestamp
--   last_read_date    the later of the two
--   streak_days       from the side that owns that later date; a tie keeps
--                     the uploaded value
--   current_book /    the stored position when its chapter was read later than
--   current_chapter   the uploaded one (falling back to the stored synced_at when
--                     that chapter is unread), or when the upload is a blank
--                     GEN 1 with nothing read; otherwise the uploaded position
--   synced_at         the server's now()
-- Chapters are only ever added by the app (there is no "mark unread"), so a
-- union never keeps something a reader removed. Non-numeric chapter values are
-- dropped (none exist in production; the app only writes epoch milliseconds).
--
-- SECURITY INVOKER: the reads and writes run as the caller, so the existing
-- own-row RLS policies on user_progress apply exactly as they do to the plain
-- upsert. The row owner is always auth.uid(); any user_id in the payload is
-- ignored.
--
-- Backward compatibility: additive (one function), no table change. Installed
-- builds keep using the plain upsert. New clients call this function and fall
-- back to the upsert when PostgREST reports it missing (PGRST202 / 42883 / 404),
-- so the app works before and after this migration.

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

  -- chapters_read: an object of "BOOK_N": epoch-milliseconds (a whole Bible is 1,189).
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

  -- First write for the account (signup normally creates the row): the upload is the row.
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

  -- Lock the row: a concurrent call waits here and then reads what this one wrote.
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
  'unioned, latest read date and its streak kept) and returns the stored row.';

REVOKE ALL ON FUNCTION public.merge_user_progress(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_user_progress(jsonb) TO authenticated;
