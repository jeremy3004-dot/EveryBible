-- Add reading time tracking to engagement summary and admin analytics.
--
-- The client now emits `reading_ended` events via the anonymous analytics
-- pipeline with `duration_seconds` in event_properties.  These events land
-- in analytics_events with user_id = NULL (anonymous) or a real user_id when
-- the user is authenticated.
--
-- This migration:
--   1. Adds total_reading_minutes column to user_engagement_summary
--   2. Updates refresh_my_engagement to compute reading minutes from reading_ended events
--   3. Updates get_admin_analytics_overview to include reading time in admin dashboard

-- ---------------------------------------------------------------------------
-- 1. Schema change
-- ---------------------------------------------------------------------------

ALTER TABLE user_engagement_summary
  ADD COLUMN IF NOT EXISTS total_reading_minutes INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. Updated refresh_my_engagement (per-user, authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_my_engagement()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
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
  -- Count chapters read from user_progress
  SELECT COALESCE(jsonb_object_keys_count(chapters_read), 0)
  INTO v_chapters
  FROM (
    SELECT chapters_read FROM public.user_progress WHERE user_id = v_user_id
  ) sub;

  -- Count listening minutes from analytics events
  SELECT COALESCE(SUM((event_properties->>'duration_ms')::bigint) / 60000, 0)
  INTO v_listening
  FROM public.analytics_events
  WHERE user_id = v_user_id AND event_name = 'audio_completed';

  -- Count reading minutes from reading_ended events (duration_seconds → minutes)
  SELECT COALESCE(SUM(GREATEST((event_properties->>'duration_seconds')::bigint, 0)) / 60, 0)
  INTO v_reading
  FROM public.analytics_events
  WHERE user_id = v_user_id AND event_name = 'reading_ended';

  -- Count sessions
  SELECT COUNT(DISTINCT session_id)
  INTO v_sessions
  FROM public.analytics_events
  WHERE user_id = v_user_id AND session_id IS NOT NULL;

  -- Avg session minutes
  SELECT COALESCE(AVG(session_dur), 0)
  INTO v_avg_session
  FROM (
    SELECT session_id, EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 60 AS session_dur
    FROM public.analytics_events
    WHERE user_id = v_user_id AND session_id IS NOT NULL
    GROUP BY session_id
  ) sessions;

  -- Get streak from user_progress
  SELECT COALESCE(streak_days, 0), last_read_date
  INTO v_streak, v_last_active
  FROM public.user_progress
  WHERE user_id = v_user_id;

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
$$;

-- ---------------------------------------------------------------------------
-- 3. Updated get_admin_analytics_overview (admin dashboard)
-- ---------------------------------------------------------------------------
-- Adds a reading_events CTE and surfaces readingTotalMinutes + dailyReadingMinutes
-- alongside the existing listening metrics.

CREATE OR REPLACE FUNCTION public.get_admin_analytics_overview(
  p_since TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
  p_total_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_total_days INTEGER := GREATEST(COALESCE(p_total_days, 30), 1);
BEGIN
  RETURN (
    WITH day_series AS (
      SELECT generate_series(
        date_trunc('day', p_since),
        date_trunc('day', p_since) + ((normalized_total_days - 1) * INTERVAL '1 day'),
        INTERVAL '1 day'
      ) AS day
    ),
    preferences AS (
      SELECT
        pref.user_id,
        NULLIF(BTRIM(UPPER(pref.country_code)), '') AS country_code,
        NULLIF(BTRIM(pref.country_name), '') AS country_name
      FROM public.user_preferences AS pref
      WHERE pref.country_code IS NOT NULL
    ),
    -- -------------------------------------------------------------------------
    -- audio_events: union of completed-chapter events and incremental progress
    -- -------------------------------------------------------------------------
    audio_events AS (
      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        COALESCE(
          NULLIF(BTRIM(UPPER(event.geo_country_code)), ''),
          NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), ''),
          pref.country_code
        ) AS country_code,
        COALESCE(
          NULLIF(BTRIM(event.event_properties->>'geo_country_name'), ''),
          pref.country_name
        ) AS country_name,
        COALESCE(
          event.geo_latitude,
          CASE
            WHEN NULLIF(BTRIM(event.event_properties->>'geo_latitude_bucket'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (NULLIF(BTRIM(event.event_properties->>'geo_latitude_bucket'), ''))::double precision
            ELSE NULL
          END
        ) AS latitude,
        COALESCE(
          event.geo_longitude,
          CASE
            WHEN NULLIF(BTRIM(event.event_properties->>'geo_longitude_bucket'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (NULLIF(BTRIM(event.event_properties->>'geo_longitude_bucket'), ''))::double precision
            ELSE NULL
          END
        ) AS longitude,
        NULLIF(BTRIM(event.event_properties->>'geo_label'), '') AS geo_label,
        GREATEST(
          COALESCE(NULLIF(event.event_properties->>'duration_ms', '')::numeric, 0),
          0
        ) / 60000.0 AS minutes
      FROM public.analytics_events AS event
      LEFT JOIN preferences AS pref ON pref.user_id = event.user_id
      WHERE event.event_name = 'audio_completed'
        AND event.created_at >= p_since

      UNION ALL

      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        COALESCE(
          NULLIF(BTRIM(UPPER(event.geo_country_code)), ''),
          NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), ''),
          pref.country_code
        ) AS country_code,
        COALESCE(
          NULLIF(BTRIM(event.event_properties->>'geo_country_name'), ''),
          pref.country_name
        ) AS country_name,
        COALESCE(
          event.geo_latitude,
          CASE
            WHEN NULLIF(BTRIM(event.event_properties->>'geo_latitude_bucket'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (NULLIF(BTRIM(event.event_properties->>'geo_latitude_bucket'), ''))::double precision
            ELSE NULL
          END
        ) AS latitude,
        COALESCE(
          event.geo_longitude,
          CASE
            WHEN NULLIF(BTRIM(event.event_properties->>'geo_longitude_bucket'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (NULLIF(BTRIM(event.event_properties->>'geo_longitude_bucket'), ''))::double precision
            ELSE NULL
          END
        ) AS longitude,
        NULL AS geo_label,
        GREATEST(
          COALESCE(NULLIF(event.event_properties->>'listened_ms', '')::numeric, 0),
          0
        ) / 60000.0 AS minutes
      FROM public.analytics_events AS event
      LEFT JOIN preferences AS pref ON pref.user_id = event.user_id
      WHERE event.event_name = 'audio_playback_progress'
        AND event.created_at >= p_since
        AND COALESCE(NULLIF(event.event_properties->>'listened_ms', '')::numeric, 0) > 0
    ),
    -- -------------------------------------------------------------------------
    -- reading_events: reading_ended events carrying duration_seconds
    -- -------------------------------------------------------------------------
    reading_events AS (
      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        COALESCE(
          NULLIF(BTRIM(UPPER(event.geo_country_code)), ''),
          pref.country_code
        ) AS country_code,
        COALESCE(
          NULLIF(BTRIM(event.event_properties->>'geo_country_name'), ''),
          pref.country_name
        ) AS country_name,
        GREATEST(
          COALESCE(NULLIF(event.event_properties->>'duration_seconds', '')::numeric, 0),
          0
        ) / 60.0 AS minutes
      FROM public.analytics_events AS event
      LEFT JOIN preferences AS pref ON pref.user_id = event.user_id
      WHERE event.event_name = 'reading_ended'
        AND event.created_at >= p_since
        AND COALESCE(NULLIF(event.event_properties->>'duration_seconds', '')::numeric, 0) > 0
    ),
    download_events AS (
      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        COALESCE(
          NULLIF(BTRIM(UPPER(event.geo_country_code)), ''),
          NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), ''),
          pref.country_code
        ) AS country_code,
        COALESCE(
          NULLIF(BTRIM(event.event_properties->>'geo_country_name'), ''),
          pref.country_name
        ) AS country_name,
        COALESCE(
          event.geo_latitude,
          CASE
            WHEN NULLIF(BTRIM(event.event_properties->>'geo_latitude_bucket'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (NULLIF(BTRIM(event.event_properties->>'geo_latitude_bucket'), ''))::double precision
            ELSE NULL
          END
        ) AS latitude,
        COALESCE(
          event.geo_longitude,
          CASE
            WHEN NULLIF(BTRIM(event.event_properties->>'geo_longitude_bucket'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN (NULLIF(BTRIM(event.event_properties->>'geo_longitude_bucket'), ''))::double precision
            ELSE NULL
          END
        ) AS longitude,
        NULLIF(BTRIM(event.event_properties->>'geo_label'), '') AS geo_label,
        GREATEST(
          COALESCE(NULLIF(event.event_properties->>'download_units', '')::numeric, 1),
          1
        )::integer AS download_units
      FROM public.analytics_events AS event
      LEFT JOIN preferences AS pref
        ON pref.user_id = event.user_id
      WHERE event.event_name IN ('text_translation_download_completed', 'audio_download_completed')
        AND event.created_at >= p_since
    ),
    daily_listening AS (
      SELECT
        series.day::date AS day,
        COALESCE(ROUND(SUM(audio.minutes)::numeric, 1), 0) AS minutes
      FROM day_series AS series
      LEFT JOIN audio_events AS audio
        ON date_trunc('day', audio.created_at) = series.day
      GROUP BY series.day
      ORDER BY series.day
    ),
    daily_reading AS (
      SELECT
        series.day::date AS day,
        COALESCE(ROUND(SUM(reading.minutes)::numeric, 1), 0) AS minutes
      FROM day_series AS series
      LEFT JOIN reading_events AS reading
        ON date_trunc('day', reading.created_at) = series.day
      GROUP BY series.day
      ORDER BY series.day
    ),
    daily_downloads AS (
      SELECT
        series.day::date AS day,
        COALESCE(SUM(download.download_units), 0)::integer AS value
      FROM day_series AS series
      LEFT JOIN download_events AS download
        ON date_trunc('day', download.created_at) = series.day
      GROUP BY series.day
      ORDER BY series.day
    ),
    audio_country_rollups AS (
      SELECT
        audio.country_code AS code,
        MAX(audio.country_name) AS name,
        COALESCE(ROUND(SUM(audio.minutes)::numeric, 1), 0) AS "listeningMinutes",
        COUNT(DISTINCT audio.user_id) FILTER (WHERE audio.user_id IS NOT NULL) AS "listenerCount"
      FROM audio_events AS audio
      WHERE audio.country_code IS NOT NULL
      GROUP BY audio.country_code
      HAVING COALESCE(SUM(audio.minutes), 0) > 0
    ),
    reading_country_rollups AS (
      SELECT
        reading.country_code AS code,
        MAX(reading.country_name) AS name,
        COALESCE(ROUND(SUM(reading.minutes)::numeric, 1), 0) AS "readingMinutes"
      FROM reading_events AS reading
      WHERE reading.country_code IS NOT NULL
      GROUP BY reading.country_code
      HAVING COALESCE(SUM(reading.minutes), 0) > 0
    ),
    download_country_rollups AS (
      SELECT
        download.country_code AS code,
        MAX(download.country_name) AS name,
        COALESCE(SUM(download.download_units), 0)::integer AS "downloadUnits"
      FROM download_events AS download
      WHERE download.country_code IS NOT NULL
      GROUP BY download.country_code
      HAVING COALESCE(SUM(download.download_units), 0) > 0
    ),
    country_rollups AS (
      SELECT
        COALESCE(audio.code, download.code, reading.code) AS code,
        COALESCE(audio.name, download.name, reading.name) AS name,
        COALESCE(audio."listeningMinutes", 0) AS "listeningMinutes",
        COALESCE(audio."listenerCount", 0) AS "listenerCount",
        COALESCE(download."downloadUnits", 0) AS "downloadUnits",
        COALESCE(reading."readingMinutes", 0) AS "readingMinutes"
      FROM audio_country_rollups AS audio
      FULL OUTER JOIN download_country_rollups AS download
        ON download.code = audio.code
      FULL OUTER JOIN reading_country_rollups AS reading
        ON reading.code = COALESCE(audio.code, download.code)
      WHERE COALESCE(audio.code, download.code, reading.code) IS NOT NULL
    ),
    geo_activity AS (
      SELECT
        audio.user_id,
        audio.session_id,
        audio.latitude,
        audio.longitude,
        audio.country_code,
        audio.country_name,
        audio.geo_label,
        audio.minutes AS listening_minutes,
        0::integer AS download_units
      FROM audio_events AS audio
      UNION ALL
      SELECT
        download.user_id,
        download.session_id,
        download.latitude,
        download.longitude,
        download.country_code,
        download.country_name,
        download.geo_label,
        0::numeric AS listening_minutes,
        download.download_units
      FROM download_events AS download
    ),
    location_rollups AS (
      SELECT
        CONCAT_WS(
          ':',
          ROUND(location.latitude::numeric, 2)::text,
          ROUND(location.longitude::numeric, 2)::text,
          COALESCE(location.country_code, 'UNSET')
        ) AS key,
        COALESCE(
          MAX(location.geo_label),
          CASE
            WHEN MAX(location.country_name) IS NOT NULL THEN CONCAT('Approximate area in ', MAX(location.country_name))
            ELSE 'Approximate unattributed area'
          END
        ) AS label,
        location.latitude AS latitude,
        location.longitude AS longitude,
        location.country_code,
        MAX(location.country_name) AS country_name,
        COALESCE(ROUND(SUM(location.listening_minutes)::numeric, 1), 0) AS "listeningMinutes",
        COALESCE(SUM(location.download_units), 0)::integer AS "downloadUnits",
        COUNT(DISTINCT location.user_id) FILTER (
          WHERE location.user_id IS NOT NULL AND location.listening_minutes > 0
        ) AS "listenerCount"
      FROM geo_activity AS location
      WHERE location.latitude IS NOT NULL
        AND location.longitude IS NOT NULL
      GROUP BY location.latitude, location.longitude, location.country_code
      HAVING COALESCE(SUM(location.listening_minutes), 0) > 0
         OR COALESCE(SUM(location.download_units), 0) > 0
    ),
    engagement AS (
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(summary.total_listening_minutes, 0) > 0
        )::integer AS "userCountWithListening",
        COALESCE(
          ROUND(AVG(COALESCE(summary.engagement_score, 0))::numeric, 0),
          0
        )::integer AS "averageEngagementScore"
      FROM public.user_engagement_summary AS summary
    ),
    session_counts AS (
      SELECT COUNT(DISTINCT audio.session_id)::integer AS total
      FROM audio_events AS audio
      WHERE audio.session_id IS NOT NULL
    )
    SELECT jsonb_build_object(
      'activeCountryCount', COALESCE((SELECT COUNT(*) FROM country_rollups), 0),
      'averageEngagementScore', COALESCE((SELECT "averageEngagementScore" FROM engagement), 0),
      'countryMetrics', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'code', country.code,
              'name', country.name,
              'listeningMinutes', country."listeningMinutes",
              'downloadUnits', country."downloadUnits",
              'listenerCount', country."listenerCount",
              'readingMinutes', country."readingMinutes"
            )
            ORDER BY country."listeningMinutes" DESC, country."downloadUnits" DESC, country.name
          )
          FROM country_rollups AS country
        ),
        '[]'::jsonb
      ),
      'locationMetrics', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'key', location.key,
              'label', location.label,
              'countryCode', location.country_code,
              'countryName', location.country_name,
              'latitude', location.latitude,
              'longitude', location.longitude,
              'listeningMinutes', location."listeningMinutes",
              'downloadUnits', location."downloadUnits",
              'listenerCount', location."listenerCount"
            )
            ORDER BY location."listeningMinutes" DESC, location."downloadUnits" DESC, location.label
          )
          FROM location_rollups AS location
        ),
        '[]'::jsonb
      ),
      'dailyDownloadUnits', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'day', daily.day,
              'value', daily.value
            )
            ORDER BY daily.day
          )
          FROM daily_downloads AS daily
        ),
        '[]'::jsonb
      ),
      'dailyListeningMinutes', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'day', daily.day,
              'value', daily.minutes
            )
            ORDER BY daily.day
          )
          FROM daily_listening AS daily
        ),
        '[]'::jsonb
      ),
      'dailyReadingMinutes', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'day', daily.day,
              'value', daily.minutes
            )
            ORDER BY daily.day
          )
          FROM daily_reading AS daily
        ),
        '[]'::jsonb
      ),
      'listeningTotalMinutes', COALESCE((SELECT ROUND(SUM(audio.minutes))::integer FROM audio_events AS audio), 0),
      'readingTotalMinutes', COALESCE((SELECT ROUND(SUM(reading.minutes))::integer FROM reading_events AS reading), 0),
      'totalDownloadUnits', COALESCE((SELECT SUM(download.download_units) FROM download_events AS download), 0),
      'totalTrackedSessions', COALESCE((SELECT total FROM session_counts), 0),
      'userCountWithListening', COALESCE((SELECT "userCountWithListening" FROM engagement), 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_analytics_overview(TIMESTAMPTZ, INTEGER)
TO service_role;
