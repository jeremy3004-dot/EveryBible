-- Fix: remove profile-country fallback from get_admin_analytics_overview.
--
-- Previously, when IP-based geolocation failed (no IPINFO_TOKEN → rate-limit,
-- or missing x-forwarded-for headers), the analytics function fell back to the
-- country the user chose during onboarding (stored in user_preferences).
-- This caused all listening/download events by authenticated users to be
-- attributed to their home country even when they were abroad, and the heat
-- map showed their home country instead of their actual location.
--
-- Fix: use only event-level geo columns (set by the edge functions from the
-- real request IP). If those are NULL the event is unattributed — it will not
-- appear in country rollups or the heat map. This is the correct behavior:
-- "unknown location" is better than "wrong location".
--
-- The preferences CTE and all LEFT JOINs with user_preferences are removed.

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
    -- -------------------------------------------------------------------------
    -- audio_events: completed-chapter events and incremental progress events.
    -- Country is taken only from the event's own geo columns (set server-side
    -- by the edge function from the request IP).  No fallback to profile country.
    -- -------------------------------------------------------------------------
    audio_events AS (
      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        COALESCE(
          NULLIF(BTRIM(UPPER(event.geo_country_code)), ''),
          NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), '')
        ) AS country_code,
        NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') AS country_name,
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
      WHERE event.event_name = 'audio_completed'
        AND event.created_at >= p_since

      UNION ALL

      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        COALESCE(
          NULLIF(BTRIM(UPPER(event.geo_country_code)), ''),
          NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), '')
        ) AS country_code,
        NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') AS country_name,
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
      WHERE event.event_name = 'audio_playback_progress'
        AND event.created_at >= p_since
        AND COALESCE(NULLIF(event.event_properties->>'listened_ms', '')::numeric, 0) > 0
    ),
    -- -------------------------------------------------------------------------
    -- reading_events: reading_ended events.
    -- Anonymous events (user_id = NULL) — country from geo columns only.
    -- -------------------------------------------------------------------------
    reading_events AS (
      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        NULLIF(BTRIM(UPPER(event.geo_country_code)), '') AS country_code,
        NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') AS country_name,
        GREATEST(
          COALESCE(NULLIF(event.event_properties->>'duration_seconds', '')::numeric, 0),
          0
        ) / 60.0 AS minutes
      FROM public.analytics_events AS event
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
          NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), '')
        ) AS country_code,
        NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') AS country_name,
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
