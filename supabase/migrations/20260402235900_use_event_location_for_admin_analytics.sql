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
        ) / 60000.0 AS minutes,
        NULLIF(event.event_properties->>'geo_latitude_bucket', '')::numeric AS latitude_bucket,
        NULLIF(event.event_properties->>'geo_longitude_bucket', '')::numeric AS longitude_bucket,
        UPPER(NULLIF(event.event_properties->>'geo_country_code', '')) AS country_code,
        NULLIF(event.event_properties->>'geo_country_name', '') AS country_name,
        NULLIF(event.event_properties->>'geo_label', '') AS geo_label
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
        )::integer AS download_units,
        NULLIF(event.event_properties->>'geo_latitude_bucket', '')::numeric AS latitude_bucket,
        NULLIF(event.event_properties->>'geo_longitude_bucket', '')::numeric AS longitude_bucket,
        UPPER(NULLIF(event.event_properties->>'geo_country_code', '')) AS country_code,
        NULLIF(event.event_properties->>'geo_country_name', '') AS country_name,
        NULLIF(event.event_properties->>'geo_label', '') AS geo_label
      FROM public.analytics_events AS event
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
    legacy_preferences AS (
      SELECT
        pref.user_id,
        UPPER(pref.country_code) AS country_code,
        pref.country_name
      FROM public.user_preferences AS pref
      WHERE pref.country_code IS NOT NULL
    ),
    geo_activity AS (
      SELECT
        audio.user_id,
        audio.session_id,
        audio.latitude_bucket,
        audio.longitude_bucket,
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
        download.latitude_bucket,
        download.longitude_bucket,
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
          latitude_bucket::text,
          longitude_bucket::text,
          COALESCE(country_code, 'UNSET')
        ) AS key,
        COALESCE(
          MAX(geo_label),
          CASE
            WHEN MAX(country_name) IS NOT NULL THEN CONCAT('Approximate area in ', MAX(country_name))
            ELSE 'Approximate unattributed area'
          END
        ) AS label,
        latitude_bucket AS latitude,
        longitude_bucket AS longitude,
        country_code,
        MAX(country_name) AS country_name,
        COALESCE(ROUND(SUM(listening_minutes)::numeric, 1), 0) AS "listeningMinutes",
        COALESCE(SUM(download_units), 0)::integer AS "downloadUnits",
        COUNT(DISTINCT user_id) FILTER (
          WHERE user_id IS NOT NULL AND listening_minutes > 0
        ) AS "listenerCount"
      FROM geo_activity
      WHERE latitude_bucket IS NOT NULL
        AND longitude_bucket IS NOT NULL
      GROUP BY latitude_bucket, longitude_bucket, country_code
      HAVING COALESCE(SUM(listening_minutes), 0) > 0
         OR COALESCE(SUM(download_units), 0) > 0
    ),
    country_rollups AS (
      SELECT
        COALESCE(activity.country_code, pref.country_code, 'UNSET') AS code,
        COALESCE(MAX(activity.country_name), MAX(pref.country_name), 'Unattributed') AS name,
        COALESCE(ROUND(SUM(activity.listening_minutes)::numeric, 1), 0) AS "listeningMinutes",
        COALESCE(SUM(activity.download_units), 0)::integer AS "downloadUnits",
        COUNT(DISTINCT activity.user_id) FILTER (
          WHERE activity.user_id IS NOT NULL AND activity.listening_minutes > 0
        ) AS "listenerCount"
      FROM geo_activity AS activity
      LEFT JOIN legacy_preferences AS pref
        ON pref.user_id = activity.user_id
      WHERE activity.country_code IS NOT NULL
         OR activity.country_name IS NOT NULL
         OR pref.country_code IS NOT NULL
      GROUP BY COALESCE(activity.country_code, pref.country_code, 'UNSET')
      HAVING COALESCE(SUM(activity.listening_minutes), 0) > 0
         OR COALESCE(SUM(activity.download_units), 0) > 0
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
      'listeningTotalMinutes', COALESCE((SELECT ROUND(SUM(minutes))::integer FROM audio_events), 0),
      'totalDownloadUnits', COALESCE((SELECT SUM(download_units) FROM download_events), 0),
      'totalTrackedSessions', COALESCE((SELECT total FROM session_counts), 0),
      'userCountWithListening', COALESCE((SELECT "userCountWithListening" FROM engagement), 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_analytics_overview(TIMESTAMPTZ, INTEGER)
TO authenticated, service_role;
