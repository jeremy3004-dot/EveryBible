-- Add coarse IP-derived location columns to analytics_events and switch the admin
-- analytics overview to location-based rollups instead of country preference rollups.

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS geo_country_code TEXT,
  ADD COLUMN IF NOT EXISTS geo_region_code TEXT,
  ADD COLUMN IF NOT EXISTS geo_region_name TEXT,
  ADD COLUMN IF NOT EXISTS geo_city TEXT,
  ADD COLUMN IF NOT EXISTS geo_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_timezone TEXT,
  ADD COLUMN IF NOT EXISTS geo_accuracy_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_source TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_geo_location_created
  ON public.analytics_events (geo_country_code, geo_region_code, geo_city, created_at);

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
        NULLIF(UPPER(TRIM(event.geo_country_code)), '') AS country_code,
        NULLIF(UPPER(TRIM(event.geo_region_code)), '') AS region_code,
        NULLIF(TRIM(event.geo_region_name), '') AS region_name,
        NULLIF(TRIM(event.geo_city), '') AS city,
        event.geo_latitude AS latitude,
        event.geo_longitude AS longitude,
        event.geo_accuracy_km AS accuracy_km
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
        NULLIF(UPPER(TRIM(event.geo_country_code)), '') AS country_code,
        NULLIF(UPPER(TRIM(event.geo_region_code)), '') AS region_code,
        NULLIF(TRIM(event.geo_region_name), '') AS region_name,
        NULLIF(TRIM(event.geo_city), '') AS city,
        event.geo_latitude AS latitude,
        event.geo_longitude AS longitude,
        event.geo_accuracy_km AS accuracy_km
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
    audio_location_rollups AS (
      SELECT
        COALESCE(NULLIF(CONCAT_WS('|', audio.country_code, audio.region_code, audio.city), ''), 'unknown') AS code,
        audio.country_code AS "countryCode",
        audio.region_code AS "regionCode",
        audio.region_name AS "regionName",
        audio.city AS city,
        COALESCE(ROUND(AVG(audio.latitude)::numeric, 6), 0) AS latitude,
        COALESCE(ROUND(AVG(audio.longitude)::numeric, 6), 0) AS longitude,
        COALESCE(ROUND(AVG(audio.accuracy_km)::numeric, 1), 0) AS "accuracyKm",
        COALESCE(ROUND(SUM(audio.minutes)::numeric, 1), 0) AS "listeningMinutes",
        COUNT(DISTINCT audio.user_id) FILTER (WHERE audio.user_id IS NOT NULL)::integer AS "listenerCount"
      FROM audio_events AS audio
      GROUP BY audio.country_code, audio.region_code, audio.region_name, audio.city
      HAVING COALESCE(SUM(audio.minutes), 0) > 0
    ),
    download_location_rollups AS (
      SELECT
        COALESCE(NULLIF(CONCAT_WS('|', download.country_code, download.region_code, download.city), ''), 'unknown') AS code,
        download.country_code AS "countryCode",
        download.region_code AS "regionCode",
        download.region_name AS "regionName",
        download.city AS city,
        COALESCE(ROUND(AVG(download.latitude)::numeric, 6), 0) AS latitude,
        COALESCE(ROUND(AVG(download.longitude)::numeric, 6), 0) AS longitude,
        COALESCE(ROUND(AVG(download.accuracy_km)::numeric, 1), 0) AS "accuracyKm",
        COALESCE(SUM(download.download_units), 0)::integer AS "downloadUnits"
      FROM download_events AS download
      GROUP BY download.country_code, download.region_code, download.region_name, download.city
      HAVING COALESCE(SUM(download.download_units), 0) > 0
    ),
    location_rollups AS (
      SELECT
        COALESCE(audio.code, download.code) AS code,
        COALESCE(audio."countryCode", download."countryCode") AS "countryCode",
        COALESCE(audio."regionCode", download."regionCode") AS "regionCode",
        COALESCE(audio."regionName", download."regionName") AS "regionName",
        COALESCE(audio.city, download.city) AS city,
        COALESCE(audio.latitude, download.latitude) AS latitude,
        COALESCE(audio.longitude, download.longitude) AS longitude,
        COALESCE(audio."accuracyKm", download."accuracyKm") AS "accuracyKm",
        COALESCE(audio."listeningMinutes", 0) AS "listeningMinutes",
        COALESCE(download."downloadUnits", 0) AS "downloadUnits",
        COALESCE(audio."listenerCount", 0) AS "listenerCount"
      FROM audio_location_rollups AS audio
      FULL OUTER JOIN download_location_rollups AS download
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
      'activeLocationCount', COALESCE((SELECT COUNT(*) FROM location_rollups), 0),
      'averageEngagementScore', COALESCE((SELECT "averageEngagementScore" FROM engagement), 0),
      'locationMetrics', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'code', location.code,
              'countryCode', location."countryCode",
              'regionCode', location."regionCode",
              'regionName', location."regionName",
              'city', location.city,
              'latitude', location.latitude,
              'longitude', location.longitude,
              'accuracyKm', location."accuracyKm",
              'listeningMinutes', location."listeningMinutes",
              'downloadUnits', location."downloadUnits",
              'listenerCount', location."listenerCount"
            )
            ORDER BY location."listeningMinutes" DESC, location."downloadUnits" DESC, location.code
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
      'listeningTotalMinutes', COALESCE(
        (SELECT ROUND(SUM(audio.minutes)::numeric, 0)::integer FROM audio_events AS audio),
        0
      ),
      'totalDownloadUnits', COALESCE(
        (SELECT SUM(download.download_units)::integer FROM download_events AS download),
        0
      ),
      'totalTrackedSessions', COALESCE((SELECT total FROM session_counts), 0),
      'userCountWithListening', COALESCE((SELECT "userCountWithListening" FROM engagement), 0)
    );
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_analytics_overview(TIMESTAMPTZ, INTEGER)
TO authenticated, service_role;
