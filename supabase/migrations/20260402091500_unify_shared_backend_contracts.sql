-- Shared backend contracts for mobile content overrides and admin analytics rollups

CREATE OR REPLACE FUNCTION public.get_live_mobile_content(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  live_verse JSONB;
  live_images JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', image.id,
        'title', image.title,
        'kind', image.kind,
        'imageUrl', image.public_url,
        'altText', image.alt_text,
        'startsAt', image.starts_at,
        'endsAt', image.ends_at
      )
      ORDER BY image.starts_at DESC NULLS LAST, image.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO live_images
  FROM public.content_images AS image
  WHERE image.state = 'live'
    AND (image.starts_at IS NULL OR image.starts_at <= p_now)
    AND (image.ends_at IS NULL OR image.ends_at >= p_now);

  SELECT jsonb_build_object(
    'id', verse.id,
    'title', verse.title,
    'verseText', verse.verse_text,
    'referenceLabel', verse.reference_label,
    'translationId', verse.translation_id,
    'imageUrl', image.public_url,
    'startsAt', verse.starts_at,
    'endsAt', verse.ends_at
  )
  INTO live_verse
  FROM public.verse_of_day_entries AS verse
  LEFT JOIN public.content_images AS image
    ON image.id = verse.image_id
  WHERE verse.state = 'live'
    AND (verse.starts_at IS NULL OR verse.starts_at <= p_now)
    AND (verse.ends_at IS NULL OR verse.ends_at >= p_now)
  ORDER BY verse.starts_at DESC NULLS LAST, verse.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'generatedAt', p_now,
    'images', live_images,
    'verseOfDay', live_verse
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_mobile_content(TIMESTAMPTZ)
TO anon, authenticated, service_role;

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
    audio_events AS (
      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        GREATEST(
          COALESCE(NULLIF(event.event_properties->>'duration_ms', '')::numeric, 0),
          0
        ) / 60000.0 AS minutes
      FROM public.analytics_events AS event
      WHERE event.event_name = 'audio_completed'
        AND event.created_at >= p_since
    ),
    download_events AS (
      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        GREATEST(
          COALESCE(NULLIF(event.event_properties->>'download_units', '')::numeric, 1),
          1
        )::integer AS download_units
      FROM public.analytics_events AS event
      WHERE event.event_name IN ('text_translation_download_completed', 'audio_download_completed')
        AND event.created_at >= p_since
    ),
    preferences AS (
      SELECT
        pref.user_id,
        UPPER(pref.country_code) AS country_code,
        pref.country_name
      FROM public.user_preferences AS pref
      WHERE pref.country_code IS NOT NULL
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
        pref.country_code AS code,
        MAX(pref.country_name) AS name,
        COALESCE(ROUND(SUM(audio.minutes)::numeric, 1), 0) AS "listeningMinutes",
        COUNT(DISTINCT audio.user_id) FILTER (WHERE audio.user_id IS NOT NULL) AS "listenerCount"
      FROM preferences AS pref
      LEFT JOIN audio_events AS audio
        ON audio.user_id = pref.user_id
      GROUP BY pref.country_code
      HAVING COALESCE(SUM(audio.minutes), 0) > 0
    ),
    download_country_rollups AS (
      SELECT
        pref.country_code AS code,
        MAX(pref.country_name) AS name,
        COALESCE(SUM(download.download_units), 0)::integer AS "downloadUnits"
      FROM preferences AS pref
      LEFT JOIN download_events AS download
        ON download.user_id = pref.user_id
      GROUP BY pref.country_code
      HAVING COALESCE(SUM(download.download_units), 0) > 0
    ),
    country_rollups AS (
      SELECT
        COALESCE(audio.code, download.code) AS code,
        COALESCE(audio.name, download.name) AS name,
        COALESCE(audio."listeningMinutes", 0) AS "listeningMinutes",
        COALESCE(download."downloadUnits", 0) AS "downloadUnits",
        COALESCE(audio."listenerCount", 0) AS "listenerCount"
      FROM audio_country_rollups AS audio
      FULL OUTER JOIN download_country_rollups AS download
        ON download.code = audio.code
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
              'listenerCount', country."listenerCount"
            )
            ORDER BY country."listeningMinutes" DESC, country."downloadUnits" DESC, country.name
          )
          FROM country_rollups AS country
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
      'listeningTotalMinutes', COALESCE(
        (SELECT ROUND(SUM(audio.minutes))::integer FROM audio_events AS audio),
        0
      ),
      'totalDownloadUnits', COALESCE(
        (SELECT SUM(download.download_units)::integer FROM download_events AS download),
        0
      ),
      'totalTrackedSessions', COALESCE((SELECT total FROM session_counts), 0),
      'userCountWithListening', COALESCE((SELECT "userCountWithListening" FROM engagement), 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_analytics_overview(TIMESTAMPTZ, INTEGER)
TO service_role;
