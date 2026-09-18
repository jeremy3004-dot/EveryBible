-- Preserve historical attribution as unknown. Only newly verified submissions get a category.
ALTER TABLE public.chapter_feedback_submissions
  ADD COLUMN IF NOT EXISTS contributor_category text
    CHECK (contributor_category IN ('community', 'scripture_council')),
  ADD COLUMN IF NOT EXISTS feedback_sequence bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX IF NOT EXISTS chapter_feedback_sequence_idx
  ON public.chapter_feedback_submissions(feedback_sequence);
CREATE INDEX IF NOT EXISTS chapter_feedback_review_page_idx
  ON public.chapter_feedback_submissions(translation_id, book_id, chapter, sentiment, feedback_sequence DESC);

CREATE OR REPLACE FUNCTION public.protect_feedback_attribution() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.contributor_category IS DISTINCT FROM OLD.contributor_category
      OR NEW.feedback_sequence IS DISTINCT FROM OLD.feedback_sequence) THEN
    RAISE EXCEPTION 'Feedback attribution and sequence are immutable';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.contributor_category = 'scripture_council'
      AND COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Council attribution requires verified server access';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_feedback_attribution BEFORE INSERT OR UPDATE
  ON public.chapter_feedback_submissions FOR EACH ROW EXECUTE FUNCTION public.protect_feedback_attribution();

-- Service-role-only RPC: aggregate inside Postgres, so API row limits cannot truncate counts.
CREATE OR REPLACE FUNCTION public.chapter_feedback_review_v2(
  p_translation text, p_book text DEFAULT NULL, p_chapter integer DEFAULT NULL,
  p_category text DEFAULT 'all', p_status text DEFAULT 'pending',
  p_cursor jsonb DEFAULT NULL, p_positive_only boolean DEFAULT false,
  p_summary_only boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  chapters jsonb;
  page_rows jsonb;
  page_snapshot bigint;
  next_cursor jsonb;
  positive_count bigint;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO chapters FROM (
    SELECT book_id AS "bookId", chapter, count(*) AS total,
      count(*) FILTER (WHERE scripture_council_resolution IS NULL AND sentiment = 'down') AS "unresolvedDown",
      count(*) FILTER (WHERE scripture_council_resolution IS NULL AND sentiment = 'up') AS "unresolvedUp",
      count(*) FILTER (WHERE contributor_category = 'community') AS community,
      count(*) FILTER (WHERE contributor_category = 'scripture_council') AS council,
      count(*) FILTER (WHERE contributor_category IS NULL) AS unattributed
    FROM public.chapter_feedback_submissions
    WHERE translation_id = p_translation AND (p_book IS NULL OR book_id = p_book)
      AND (p_chapter IS NULL OR chapter = p_chapter)
    GROUP BY book_id, chapter ORDER BY book_id, chapter
  ) s;
  IF p_chapter IS NULL OR p_summary_only THEN
    RETURN jsonb_build_object('chapters', chapters);
  END IF;
  SELECT COALESCE((p_cursor->>'snapshot')::bigint, max(feedback_sequence), 0) INTO page_snapshot
    FROM public.chapter_feedback_submissions
    WHERE translation_id = p_translation AND book_id = p_book AND chapter = p_chapter;
  SELECT count(*) INTO positive_count FROM public.chapter_feedback_submissions
    WHERE translation_id = p_translation AND book_id = p_book AND chapter = p_chapter
      AND (p_category = 'all' OR contributor_category = p_category)
      AND (p_status = 'all' OR (scripture_council_resolution IS NULL) = (p_status = 'pending'))
      AND sentiment = 'up' AND nullif(btrim(comment), '') IS NULL AND audio_response_path IS NULL;
  -- Fetch one extra row, but anchor the next page on the last returned row.
  -- A snapshot sequence excludes later inserts from this traversal.
  WITH matching AS (
    SELECT * FROM public.chapter_feedback_submissions
    WHERE translation_id = p_translation AND book_id = p_book AND chapter = p_chapter
      AND feedback_sequence <= page_snapshot
      AND (p_category = 'all' OR contributor_category = p_category)
      AND (p_status = 'all' OR (scripture_council_resolution IS NULL) = (p_status = 'pending'))
      AND p_positive_only = (sentiment = 'up' AND nullif(btrim(comment), '') IS NULL AND audio_response_path IS NULL)
      AND (p_cursor IS NULL OR sentiment > p_cursor->>'sentiment'
        OR (sentiment = p_cursor->>'sentiment' AND feedback_sequence < (p_cursor->>'sequence')::bigint))
    ORDER BY sentiment, feedback_sequence DESC LIMIT 41
  ), numbered AS (
    SELECT to_jsonb(m) AS item, row_number() OVER (ORDER BY sentiment, feedback_sequence DESC) AS position
    FROM matching m
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY position) FILTER (WHERE position <= 40), '[]'::jsonb),
    CASE WHEN count(*) > 40 THEN jsonb_build_object(
      'snapshot', page_snapshot,
      'sentiment', (jsonb_agg(item ORDER BY position)->39)->>'sentiment',
      'sequence', ((jsonb_agg(item ORDER BY position)->39)->>'feedback_sequence')::bigint
    ) ELSE NULL END
    INTO page_rows, next_cursor FROM numbered;
  RETURN jsonb_build_object('chapters', chapters, 'rows', page_rows,
    'nextCursor', next_cursor, 'positiveCount', positive_count);
END;
$$;
REVOKE ALL ON FUNCTION public.chapter_feedback_review_v2(text,text,integer,text,text,jsonb,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_feedback_review_v2(text,text,integer,text,text,jsonb,boolean,boolean) TO service_role;

-- Preview returns the exact IDs shown in the confirmation (up to 500 at a time).
CREATE OR REPLACE FUNCTION public.chapter_feedback_positive_preview(
  p_translation text, p_book text, p_chapter integer, p_category text DEFAULT 'all'
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM (
    SELECT id FROM public.chapter_feedback_submissions
    WHERE translation_id = p_translation AND book_id = p_book AND chapter = p_chapter
      AND (p_category = 'all' OR contributor_category = p_category)
      AND sentiment = 'up' AND nullif(btrim(comment), '') IS NULL AND audio_response_path IS NULL
      AND scripture_council_resolution IS NULL
    ORDER BY feedback_sequence DESC LIMIT 500
  ) selected;
$$;
REVOKE ALL ON FUNCTION public.chapter_feedback_positive_preview(text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_feedback_positive_preview(text,text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.chapter_feedback_review_positive_ids(
  p_translation text, p_book text, p_chapter integer, p_ids uuid[], p_actor uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  IF cardinality(p_ids) > 500 THEN RAISE EXCEPTION 'At most 500 responses per batch'; END IF;
  UPDATE public.chapter_feedback_submissions SET
    scripture_council_resolution = 'no_change_needed', scripture_council_fixed_at = now(),
    scripture_council_fixed_by = p_actor, scripture_council_fixed_note = NULL
  WHERE id = ANY(p_ids) AND translation_id = p_translation AND book_id = p_book AND chapter = p_chapter
    AND sentiment = 'up' AND nullif(btrim(comment), '') IS NULL AND audio_response_path IS NULL
    AND scripture_council_resolution IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.chapter_feedback_review_positive_ids(text,text,integer,uuid[],uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_feedback_review_positive_ids(text,text,integer,uuid[],uuid) TO service_role;
