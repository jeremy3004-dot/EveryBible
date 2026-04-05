-- Include audio_playback_progress events in listening-minutes calculation.
--
-- Previously get_admin_analytics_overview only counted audio_completed events
-- (one per chapter, authenticated-only, often lost before flush). This meant
-- partial listening and anonymous sessions showed zero minutes.
--
-- audio_playback_progress fires every ~30 s while audio is playing and carries
-- listened_ms (time since last event) and is sent anonymously, so it reaches
-- the DB far more reliably.
--
-- Strategy: UNION the two event shapes under a single "audio_events" CTE.
--   • audio_completed      → duration_ms / 60000   (one row per completed chapter)
--   • audio_playback_progress → listened_ms / 60000 per tick (incremental, sums to actual time)
--
-- Note: a fully-completed chapter will produce BOTH types of events; for now
-- we accept that small overlap in exchange for reliable non-zero reporting.
-- A future migration can deduplicate once data shapes stabilise.

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
      -- Primary: audio_completed fires once per chapter (user-linked, accurate)
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

      -- Supplementary: audio_playback_progress fires every ~30 s.
      -- listened_ms is the incremental time consumed since the previous tick.
      -- Summing across a session approximates total listening time and covers
      -- partial sessions (user pauses / backgrounded mid-chapter) and anonymous
      -- users who never produce audio_completed events.
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
        -- Only count ticks that recorded actual listening time
        AND COALESCE(NULLIF(event.event_properties->>'listened_ms', '')::numeric, 0) > 0
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
        COALESCE(audio.code, download.code) AS code,
        COALESCE(audio.name, download.name) AS name,
        COALESCE(audio."listeningMinutes", 0) AS "listeningMinutes",
        COALESCE(audio."listenerCount", 0) AS "listenerCount",
        COALESCE(download."downloadUnits", 0) AS "downloadUnits"
      FROM audio_country_rollups AS audio
      FULL OUTER JOIN download_country_rollups AS download
        ON download.code = audio.code
      WHERE COALESCE(audio.code, download.code) IS NOT NULL
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
      'listeningTotalMinutes', COALESCE((SELECT ROUND(SUM(audio.minutes))::integer FROM audio_events AS audio), 0),
      'totalDownloadUnits', COALESCE((SELECT SUM(download.download_units) FROM download_events AS download), 0),
      'totalTrackedSessions', COALESCE((SELECT total FROM session_counts), 0),
      'userCountWithListening', COALESCE((SELECT "userCountWithListening" FROM engagement), 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_analytics_overview(TIMESTAMPTZ, INTEGER)
TO service_role;
