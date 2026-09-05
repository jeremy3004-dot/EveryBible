-- Keep engagement summaries aligned with the admin usage taxonomy.
CREATE OR REPLACE FUNCTION public.refresh_user_engagement(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := p_user_id;
  tick_epoch timestamptz;
  v_chapters INTEGER;
  v_listening INTEGER;
  v_reading INTEGER;
  v_sessions INTEGER;
  v_avg_session NUMERIC;
  v_streak INTEGER;
  v_longest_streak INTEGER;
  v_last_active DATE;
  v_plans INTEGER;
  v_prayers INTEGER;
  v_annotations INTEGER;
  v_score INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'A user is required'; END IF;
  SELECT MIN(created_at) INTO tick_epoch FROM public.analytics_events
    WHERE event_name = 'audio_playback_progress' AND public.safe_numeric(event_properties->>'listened_ms') > 0;
  -- Count chapters read from user_progress
  SELECT COALESCE(public.jsonb_object_keys_count(chapters_read), 0)
  INTO v_chapters
  FROM (
    SELECT chapters_read FROM public.user_progress WHERE user_id = v_user_id
  ) sub;

  -- Count listening minutes from analytics events
  SELECT FLOOR(COALESCE(SUM(CASE WHEN event_name = 'audio_playback_progress'
    THEN public.analytics_listened_ms(event_properties)
    WHEN tick_epoch IS NULL OR created_at < tick_epoch
    THEN GREATEST(COALESCE(public.safe_numeric(event_properties->>'duration_ms'),0),0)
    ELSE 0 END) / 60000, 0))
  INTO v_listening
  FROM public.analytics_events
  WHERE user_id = v_user_id AND event_name IN ('audio_completed','audio_playback_progress');

  -- Count reading minutes from reading_ended events (duration_seconds → minutes)
  SELECT FLOOR(COALESCE(SUM(GREATEST(COALESCE(public.safe_numeric(event_properties->>'duration_seconds'),0), 0)) / 60, 0))
  INTO v_reading
  FROM public.analytics_events
  WHERE user_id = v_user_id AND event_name = 'reading_ended';

  -- Count sessions
  SELECT COUNT(DISTINCT session_id)
  INTO v_sessions
  FROM public.analytics_events
  WHERE user_id = v_user_id AND session_id IS NOT NULL AND event_name = 'session_started';

  -- Avg session minutes
  SELECT COALESCE(AVG(session_dur), 0)
  INTO v_avg_session
  FROM (
    SELECT session_id, EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 60 AS session_dur
    FROM public.analytics_events
    WHERE user_id = v_user_id AND session_id IS NOT NULL
    GROUP BY session_id
    HAVING COUNT(*) FILTER (WHERE event_name='session_started') > 0
      AND COUNT(*) FILTER (WHERE event_name='session_ended') > 0
  ) sessions;

  -- Get streak from user_progress
  SELECT COALESCE(streak_days, 0), last_read_date
  INTO v_streak, v_last_active
  FROM public.user_progress
  WHERE user_id = v_user_id;

  v_chapters := COALESCE(v_chapters,0);
  v_streak := COALESCE(v_streak,0);
  SELECT GREATEST(v_last_active, MAX(created_at)::date) INTO v_last_active FROM public.analytics_events WHERE user_id=v_user_id;
  v_longest_streak := v_streak; -- simplified; could track historically

  -- Count plans completed
  SELECT COUNT(*)
  INTO v_plans
  FROM public.user_reading_plan_progress
  WHERE user_id = v_user_id AND is_completed = true;

  -- Count prayers submitted
  SELECT COUNT(*)
  INTO v_prayers
  FROM public.prayer_requests
  WHERE user_id = v_user_id;

  -- Count annotations
  SELECT COUNT(*)
  INTO v_annotations
  FROM public.user_annotations
  WHERE user_id = v_user_id AND deleted_at IS NULL;

  -- Compute engagement score (0-100)
  -- Reading 35%, Listening 25%, Streak 20%, Plans 10%, Community 10%
  v_score := LEAST(100, (
    LEAST(35, (v_chapters::numeric / 100 * 35)::integer) +
    LEAST(25, (v_listening::numeric / 500 * 25)::integer) +
    LEAST(20, (v_streak::numeric / 30 * 20)::integer) +
    LEAST(10, (v_plans * 5)) +
    LEAST(10, ((v_prayers + v_annotations)::numeric / 20 * 10)::integer)
  ));

  -- Upsert summary
  INSERT INTO public.user_engagement_summary (
    user_id, total_chapters_read, total_listening_minutes, total_reading_minutes,
    total_sessions, avg_session_minutes, current_streak_days, longest_streak_days,
    last_active_date, engagement_score, plans_completed,
    prayers_submitted, annotations_created, updated_at
  ) VALUES (
    v_user_id, v_chapters, v_listening, v_reading, v_sessions,
    v_avg_session, v_streak, v_longest_streak,
    v_last_active, v_score, v_plans,
    v_prayers, v_annotations, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_chapters_read = EXCLUDED.total_chapters_read,
    total_listening_minutes = EXCLUDED.total_listening_minutes,
    total_reading_minutes = EXCLUDED.total_reading_minutes,
    total_sessions = EXCLUDED.total_sessions,
    avg_session_minutes = EXCLUDED.avg_session_minutes,
    current_streak_days = EXCLUDED.current_streak_days,
    longest_streak_days = GREATEST(public.user_engagement_summary.longest_streak_days, EXCLUDED.longest_streak_days),
    last_active_date = EXCLUDED.last_active_date,
    engagement_score = EXCLUDED.engagement_score,
    plans_completed = EXCLUDED.plans_completed,
    prayers_submitted = EXCLUDED.prayers_submitted,
    annotations_created = EXCLUDED.annotations_created,
    updated_at = NOW();
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_user_engagement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_engagement(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_my_engagement() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM public.refresh_user_engagement(auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_my_engagement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_engagement() TO authenticated;

-- One database calculation for self-service, admin refreshes, and nightly jobs.
-- SQL aggregation avoids the API's page-size cap and includes audio-only users.
CREATE OR REPLACE FUNCTION public.refresh_engagement_summaries(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid; refreshed integer := 0;
BEGIN
  FOR target IN
    SELECT p_user_id WHERE p_user_id IS NOT NULL
    UNION
    SELECT user_id FROM public.analytics_events WHERE p_user_id IS NULL AND user_id IS NOT NULL
    UNION
    SELECT user_id FROM public.user_progress WHERE p_user_id IS NULL
    UNION
    SELECT user_id FROM public.user_engagement_summary WHERE p_user_id IS NULL
  LOOP
    PERFORM public.refresh_user_engagement(target);
    refreshed := refreshed + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'refreshed', refreshed, 'errors', 0, 'total_users', refreshed);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_engagement_summaries(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_engagement_summaries(uuid) TO service_role;
