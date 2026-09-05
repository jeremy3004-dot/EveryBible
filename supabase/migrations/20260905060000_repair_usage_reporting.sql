-- Align analytics with UTC calendar windows, preserve reading geography and
-- unlocated translation totals, and deduplicate listeners in the displayed
-- 0.1-degree buckets. No raw event rows are modified or deleted.
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS received_at timestamptz;

-- Older clients recorded media-time (elapsed * rate); schema 2 records actual
-- elapsed listening time. Normalize at query time without rewriting raw data.
CREATE OR REPLACE FUNCTION public.analytics_listened_ms(properties jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT GREATEST(COALESCE(public.safe_numeric(properties->>'listened_ms'), 0), 0) /
    CASE WHEN properties->>'analytics_schema_version' = '2' THEN 1
      WHEN public.safe_numeric(properties->>'playback_rate') BETWEEN 0.25 AND 4
        THEN public.safe_numeric(properties->>'playback_rate') ELSE 1 END;
$$;
REVOKE ALL ON FUNCTION public.analytics_listened_ms(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_listened_ms(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_overview(p_since timestamp with time zone DEFAULT (date_trunc('day', now()) - '29 days'::interval), p_total_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET timezone TO 'UTC'
AS $function$
DECLARE
  normalized_total_days INTEGER := LEAST(GREATEST(COALESCE(p_total_days, 30), 1), 180);
  window_start timestamptz := date_trunc('day', COALESCE(p_since, now() - interval '29 days'));
  window_end timestamptz;
  tick_epoch TIMESTAMPTZ;
BEGIN
  window_end := LEAST(now(), window_start + normalized_total_days * interval '1 day');
  SELECT MIN(created_at) INTO tick_epoch
  FROM public.analytics_events
  WHERE event_name = 'audio_playback_progress'
    AND COALESCE(public.safe_numeric(event_properties->>'listened_ms'), 0) > 0;

  RETURN (
    WITH day_series AS (
      SELECT generate_series(
        window_start,
        window_start + ((normalized_total_days - 1) * INTERVAL '1 day'),
        INTERVAL '1 day'
      ) AS day
    ),
    scoped_events AS (
      SELECT event.*,
        CASE WHEN coords.latitude BETWEEN -90 AND 90 AND coords.longitude BETWEEN -180 AND 180
          THEN (FLOOR(coords.latitude * 10 + 0.5) / 10)::double precision END AS bucket_latitude,
        CASE WHEN coords.latitude BETWEEN -90 AND 90 AND coords.longitude BETWEEN -180 AND 180
          THEN (FLOOR(coords.longitude * 10 + 0.5) / 10)::double precision END AS bucket_longitude
      FROM public.analytics_events event
      CROSS JOIN LATERAL (
        SELECT COALESCE(event.geo_latitude::numeric, public.safe_numeric(event.event_properties->>'geo_latitude_bucket')) AS latitude,
          COALESCE(event.geo_longitude::numeric, public.safe_numeric(event.event_properties->>'geo_longitude_bucket')) AS longitude
      ) coords
      WHERE event.created_at >= window_start AND event.created_at <= window_end
    ),
    audio_candidates AS (
      SELECT
        event.user_id, event.session_id, event.created_at,
        COALESCE(NULLIF(BTRIM(UPPER(event.geo_country_code)), ''), NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), '')) AS country_code,
        NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') AS country_name,
        event.bucket_latitude AS latitude,
        event.bucket_longitude AS longitude,
        NULLIF(BTRIM(event.event_properties->>'geo_label'), '') AS geo_label,
        CASE
          WHEN tick_epoch IS NULL OR event.created_at < tick_epoch
            THEN GREATEST(COALESCE(public.safe_numeric(event.event_properties->>'duration_ms'), 0), 0) / 60000.0
          ELSE 0
        END AS minutes,
        NULLIF(BTRIM(LOWER(event.event_properties->>'translation_id')), '') AS translation_id
      FROM scoped_events AS event
      WHERE event.event_name = 'audio_completed'
      UNION ALL
      SELECT
        event.user_id, event.session_id, event.created_at,
        COALESCE(NULLIF(BTRIM(UPPER(event.geo_country_code)), ''), NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), '')) AS country_code,
        NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') AS country_name,
        event.bucket_latitude AS latitude,
        event.bucket_longitude AS longitude,
        NULL AS geo_label,
        public.analytics_listened_ms(event.event_properties) / 60000.0 AS minutes,
        NULLIF(BTRIM(LOWER(event.event_properties->>'translation_id')), '') AS translation_id
      FROM scoped_events AS event
      WHERE event.event_name = 'audio_playback_progress'
        AND COALESCE(public.safe_numeric(event.event_properties->>'listened_ms'), 0) > 0
    ),
    audio_events AS (SELECT * FROM audio_candidates WHERE minutes > 0),
    reading_events AS (
      SELECT
        event.user_id, event.session_id, event.created_at,
        NULLIF(BTRIM(UPPER(event.geo_country_code)), '') AS country_code,
        event.bucket_latitude AS latitude, event.bucket_longitude AS longitude,
        NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') AS country_name,
        GREATEST(COALESCE(public.safe_numeric(event.event_properties->>'duration_seconds'), 0), 0) / 60.0 AS minutes,
        NULLIF(BTRIM(LOWER(event.event_properties->>'translation_id')), '') AS translation_id
      FROM scoped_events AS event
      WHERE event.event_name = 'reading_ended'
        AND COALESCE(public.safe_numeric(event.event_properties->>'duration_seconds'), 0) > 0
    ),
    download_events AS (
      SELECT
        event.user_id, event.session_id, event.created_at,
        COALESCE(NULLIF(BTRIM(UPPER(event.geo_country_code)), ''), NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), '')) AS country_code,
        NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') AS country_name,
        event.bucket_latitude AS latitude,
        event.bucket_longitude AS longitude,
        NULLIF(BTRIM(event.event_properties->>'geo_label'), '') AS geo_label,
        GREATEST(COALESCE(public.safe_numeric(event.event_properties->>'download_units'), 1), 1)::integer AS download_units,
        NULLIF(BTRIM(LOWER(event.event_properties->>'translation_id')), '') AS translation_id
      FROM scoped_events AS event
      WHERE event.event_name IN ('text_translation_download_completed', 'audio_download_completed')
    ),
    daily_listening AS (
      SELECT series.day::date AS day, COALESCE(ROUND(SUM(audio.minutes)::numeric, 1), 0) AS minutes
      FROM day_series AS series LEFT JOIN audio_events AS audio ON date_trunc('day', audio.created_at) = series.day
      GROUP BY series.day ORDER BY series.day
    ),
    daily_reading AS (
      SELECT series.day::date AS day, COALESCE(ROUND(SUM(reading.minutes)::numeric, 1), 0) AS minutes
      FROM day_series AS series LEFT JOIN reading_events AS reading ON date_trunc('day', reading.created_at) = series.day
      GROUP BY series.day ORDER BY series.day
    ),
    daily_downloads AS (
      SELECT series.day::date AS day, COALESCE(SUM(download.download_units), 0)::integer AS value
      FROM day_series AS series LEFT JOIN download_events AS download ON date_trunc('day', download.created_at) = series.day
      GROUP BY series.day ORDER BY series.day
    ),
    audio_country_rollups AS (
      SELECT audio.country_code AS code, MAX(audio.country_name) AS name,
        COALESCE(ROUND(SUM(audio.minutes)::numeric, 1), 0) AS "listeningMinutes",
        COUNT(DISTINCT COALESCE(audio.user_id::text, audio.session_id)) FILTER (WHERE audio.user_id IS NOT NULL OR audio.session_id IS NOT NULL) AS "listenerCount"
      FROM audio_events AS audio WHERE audio.country_code IS NOT NULL
      GROUP BY audio.country_code HAVING COALESCE(SUM(audio.minutes), 0) > 0
    ),
    reading_country_rollups AS (
      SELECT reading.country_code AS code, MAX(reading.country_name) AS name,
        COALESCE(ROUND(SUM(reading.minutes)::numeric, 1), 0) AS "readingMinutes"
      FROM reading_events AS reading WHERE reading.country_code IS NOT NULL
      GROUP BY reading.country_code HAVING COALESCE(SUM(reading.minutes), 0) > 0
    ),
    download_country_rollups AS (
      SELECT download.country_code AS code, MAX(download.country_name) AS name,
        COALESCE(SUM(download.download_units), 0)::integer AS "downloadUnits"
      FROM download_events AS download WHERE download.country_code IS NOT NULL
      GROUP BY download.country_code HAVING COALESCE(SUM(download.download_units), 0) > 0
    ),
    country_rollups AS (
      SELECT COALESCE(audio.code, download.code, reading.code) AS code,
        COALESCE(audio.name, download.name, reading.name) AS name,
        COALESCE(audio."listeningMinutes", 0) AS "listeningMinutes",
        COALESCE(audio."listenerCount", 0) AS "listenerCount",
        COALESCE(download."downloadUnits", 0) AS "downloadUnits",
        COALESCE(reading."readingMinutes", 0) AS "readingMinutes"
      FROM audio_country_rollups AS audio
      FULL OUTER JOIN download_country_rollups AS download ON download.code = audio.code
      FULL OUTER JOIN reading_country_rollups AS reading ON reading.code = COALESCE(audio.code, download.code)
      WHERE COALESCE(audio.code, download.code, reading.code) IS NOT NULL
    ),
    geo_activity AS (
      SELECT audio.user_id, audio.session_id, audio.latitude, audio.longitude, audio.country_code, audio.country_name, audio.geo_label, audio.minutes AS listening_minutes, 0::numeric AS reading_minutes, 0::integer AS download_units, audio.translation_id FROM audio_events AS audio
      UNION ALL
      SELECT download.user_id, download.session_id, download.latitude, download.longitude, download.country_code, download.country_name, download.geo_label, 0::numeric AS listening_minutes, 0::numeric AS reading_minutes, download.download_units, download.translation_id FROM download_events AS download
      UNION ALL
      SELECT reading.user_id, reading.session_id, reading.latitude, reading.longitude, reading.country_code, reading.country_name, NULL, 0::numeric, reading.minutes, 0::integer, reading.translation_id FROM reading_events reading
    ),
    location_rollups AS (
      SELECT CONCAT_WS(':', ROUND(location.latitude::numeric, 1)::text, ROUND(location.longitude::numeric, 1)::text, COALESCE(location.country_code, 'UNSET')) AS key,
        COALESCE(MAX(location.geo_label), CASE WHEN MAX(location.country_name) IS NOT NULL THEN CONCAT('Approximate area in ', MAX(location.country_name)) ELSE 'Approximate unattributed area' END) AS label,
        location.latitude, location.longitude, location.country_code, MAX(location.country_name) AS country_name,
        COALESCE(ROUND(SUM(location.listening_minutes)::numeric, 1), 0) AS "listeningMinutes",
        COALESCE(ROUND(SUM(location.reading_minutes)::numeric, 1), 0) AS "readingMinutes",
        COALESCE(SUM(location.download_units), 0)::integer AS "downloadUnits",
        COUNT(DISTINCT COALESCE(location.user_id::text, location.session_id)) FILTER (WHERE (location.user_id IS NOT NULL OR location.session_id IS NOT NULL) AND location.listening_minutes > 0) AS "listenerCount"
      FROM geo_activity AS location WHERE location.latitude IS NOT NULL AND location.longitude IS NOT NULL
      GROUP BY location.latitude, location.longitude, location.country_code
      HAVING COALESCE(SUM(location.listening_minutes), 0) > 0 OR COALESCE(SUM(location.download_units), 0) > 0 OR COALESCE(SUM(location.reading_minutes), 0) > 0
    ),
    engagement AS (
      SELECT COALESCE(ROUND(AVG(COALESCE(summary.engagement_score, 0))::numeric, 0), 0)::integer AS "averageEngagementScore"
      FROM public.user_engagement_summary AS summary
    ),
    session_counts AS (
      SELECT COUNT(DISTINCT session_id)::integer AS total FROM scoped_events WHERE event_name = 'session_started' AND session_id IS NOT NULL
    ),
    translation_totals AS (
      SELECT translation_id AS "translationId", ROUND(SUM(listening_minutes), 1) AS "listeningMinutes",
        ROUND(SUM(reading_minutes), 1) AS "readingMinutes", SUM(download_units)::integer AS "downloadUnits"
      FROM geo_activity WHERE translation_id IS NOT NULL GROUP BY translation_id
    ),
    collection_health AS (
      SELECT COUNT(*) AS "eventCount",
        COUNT(*) FILTER (WHERE geo_country_code ~ '^[A-Z]{2}$' AND geo_country_code NOT IN ('XX','T1')) AS "countryEventCount",
        COUNT(*) FILTER (WHERE bucket_latitude IS NOT NULL AND bucket_longitude IS NOT NULL) AS "coordinateEventCount",
        MAX(created_at) AS "latestEventAt", MAX(COALESCE(received_at, created_at)) AS "latestReceivedAt"
      FROM scoped_events
    ),
    event_counts AS (
      SELECT event_name AS "eventName", COUNT(*) AS count, MAX(created_at) AS "latestEventAt"
      FROM scoped_events GROUP BY event_name
    ),
    translation_listening_totals AS (
      SELECT audio.translation_id AS "translationId", COALESCE(ROUND(SUM(audio.minutes)::numeric, 1), 0) AS "listeningMinutes"
      FROM audio_events AS audio WHERE audio.translation_id IS NOT NULL
      GROUP BY audio.translation_id HAVING COALESCE(SUM(audio.minutes), 0) > 0
    ),
    translation_listener_totals AS (
      SELECT audio.translation_id AS "translationId",
        COUNT(DISTINCT COALESCE(audio.user_id::text, audio.session_id))
          FILTER (WHERE audio.user_id IS NOT NULL OR audio.session_id IS NOT NULL) AS "listenerCount"
      FROM audio_events AS audio WHERE audio.translation_id IS NOT NULL
      GROUP BY audio.translation_id HAVING COALESCE(SUM(audio.minutes), 0) > 0
    ),
    translation_audio_country AS (
      SELECT audio.translation_id, audio.country_code AS code, MAX(audio.country_name) AS name,
        COALESCE(ROUND(SUM(audio.minutes)::numeric, 1), 0) AS "listeningMinutes",
        COUNT(DISTINCT COALESCE(audio.user_id::text, audio.session_id)) FILTER (WHERE audio.user_id IS NOT NULL OR audio.session_id IS NOT NULL) AS "listenerCount"
      FROM audio_events AS audio WHERE audio.country_code IS NOT NULL AND audio.translation_id IS NOT NULL
      GROUP BY audio.translation_id, audio.country_code HAVING COALESCE(SUM(audio.minutes), 0) > 0
    ),
    translation_reading_country AS (
      SELECT reading.translation_id, reading.country_code AS code, MAX(reading.country_name) AS name,
        COALESCE(ROUND(SUM(reading.minutes)::numeric, 1), 0) AS "readingMinutes"
      FROM reading_events AS reading WHERE reading.country_code IS NOT NULL AND reading.translation_id IS NOT NULL
      GROUP BY reading.translation_id, reading.country_code HAVING COALESCE(SUM(reading.minutes), 0) > 0
    ),
    translation_download_country AS (
      SELECT download.translation_id, download.country_code AS code, MAX(download.country_name) AS name,
        COALESCE(SUM(download.download_units), 0)::integer AS "downloadUnits"
      FROM download_events AS download WHERE download.country_code IS NOT NULL AND download.translation_id IS NOT NULL
      GROUP BY download.translation_id, download.country_code HAVING COALESCE(SUM(download.download_units), 0) > 0
    ),
    translation_country_rollups AS (
      SELECT COALESCE(ta.translation_id, tr.translation_id, td.translation_id) AS "translationId",
        COALESCE(ta.code, tr.code, td.code) AS code, COALESCE(ta.name, tr.name, td.name) AS name,
        COALESCE(ta."listeningMinutes", 0) AS "listeningMinutes", COALESCE(ta."listenerCount", 0) AS "listenerCount",
        COALESCE(tr."readingMinutes", 0) AS "readingMinutes", COALESCE(td."downloadUnits", 0) AS "downloadUnits"
      FROM translation_audio_country AS ta
      FULL OUTER JOIN translation_reading_country AS tr ON tr.translation_id = ta.translation_id AND tr.code = ta.code
      FULL OUTER JOIN translation_download_country AS td ON td.translation_id = COALESCE(ta.translation_id, tr.translation_id) AND td.code = COALESCE(ta.code, tr.code)
      WHERE COALESCE(ta.translation_id, tr.translation_id, td.translation_id) IS NOT NULL
    ),
    translation_location_rollups AS (
      SELECT location.translation_id AS "translationId", location.country_code AS "countryCode", MAX(location.country_name) AS "countryName",
        location.latitude, location.longitude,
        COALESCE(ROUND(SUM(location.listening_minutes)::numeric, 1), 0) AS "listeningMinutes",
        COALESCE(ROUND(SUM(location.reading_minutes)::numeric, 1), 0) AS "readingMinutes",
        COALESCE(SUM(location.download_units), 0)::integer AS "downloadUnits",
        COUNT(DISTINCT COALESCE(location.user_id::text, location.session_id)) FILTER (WHERE (location.user_id IS NOT NULL OR location.session_id IS NOT NULL) AND location.listening_minutes > 0) AS "listenerCount"
      FROM geo_activity AS location WHERE location.latitude IS NOT NULL AND location.longitude IS NOT NULL AND location.translation_id IS NOT NULL
      GROUP BY location.translation_id, location.latitude, location.longitude, location.country_code
      HAVING COALESCE(SUM(location.listening_minutes), 0) > 0 OR COALESCE(SUM(location.download_units), 0) > 0 OR COALESCE(SUM(location.reading_minutes), 0) > 0
    )
    SELECT jsonb_build_object(
      'collectionHealth', (SELECT to_jsonb(h) || jsonb_build_object('eventCounts', COALESCE((SELECT jsonb_agg(e ORDER BY e.count DESC) FROM event_counts e), '[]'::jsonb)) FROM collection_health h),
      'translationTotals', COALESCE((SELECT jsonb_agg(t ORDER BY t."translationId") FROM translation_totals t), '[]'::jsonb),
      'activeCountryCount', COALESCE((SELECT COUNT(*) FROM country_rollups), 0),
      'activeLocationCount', COALESCE((SELECT COUNT(*) FROM location_rollups), 0),
      'locatedListenerCount', COALESCE((SELECT COUNT(DISTINCT COALESCE(audio.user_id::text, audio.session_id))::integer FROM audio_events AS audio WHERE audio.latitude IS NOT NULL AND audio.longitude IS NOT NULL AND audio.minutes > 0 AND (audio.user_id IS NOT NULL OR audio.session_id IS NOT NULL)), 0),
      'averageEngagementScore', COALESCE((SELECT "averageEngagementScore" FROM engagement), 0),
      'countryMetrics', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', country.code, 'name', country.name, 'listeningMinutes', country."listeningMinutes", 'downloadUnits', country."downloadUnits", 'listenerCount', country."listenerCount", 'readingMinutes', country."readingMinutes") ORDER BY country."listeningMinutes" DESC, country."downloadUnits" DESC, country.name) FROM country_rollups AS country), '[]'::jsonb),
      'locationMetrics', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', location.key, 'label', location.label, 'countryCode', location.country_code, 'countryName', location.country_name, 'latitude', location.latitude, 'longitude', location.longitude, 'listeningMinutes', location."listeningMinutes", 'readingMinutes', location."readingMinutes", 'downloadUnits', location."downloadUnits", 'listenerCount', location."listenerCount") ORDER BY location."listeningMinutes" DESC, location."downloadUnits" DESC, location.label) FROM location_rollups AS location), '[]'::jsonb),
      'translationCountryMetrics', COALESCE((SELECT jsonb_agg(jsonb_build_object('translationId', tcr."translationId", 'code', tcr.code, 'name', tcr.name, 'listeningMinutes', tcr."listeningMinutes", 'readingMinutes', tcr."readingMinutes", 'listenerCount', tcr."listenerCount", 'downloadUnits', tcr."downloadUnits") ORDER BY tcr."translationId", tcr."listeningMinutes" DESC, tcr.code) FROM translation_country_rollups AS tcr), '[]'::jsonb),
      'translationLocationMetrics', COALESCE((SELECT jsonb_agg(jsonb_build_object('translationId', tlr."translationId", 'countryCode', tlr."countryCode", 'countryName', tlr."countryName", 'latitude', tlr.latitude, 'longitude', tlr.longitude, 'listeningMinutes', tlr."listeningMinutes", 'readingMinutes', tlr."readingMinutes", 'downloadUnits', tlr."downloadUnits", 'listenerCount', tlr."listenerCount") ORDER BY tlr."translationId", tlr."listeningMinutes" DESC) FROM translation_location_rollups AS tlr), '[]'::jsonb),
      'translationListeningMinutes', COALESCE((SELECT jsonb_agg(jsonb_build_object('translationId', tlt."translationId", 'listeningMinutes', tlt."listeningMinutes") ORDER BY tlt."translationId") FROM translation_listening_totals AS tlt), '[]'::jsonb),
      'translationListenerCounts', COALESCE((SELECT jsonb_agg(jsonb_build_object('translationId', tll."translationId", 'listenerCount', tll."listenerCount") ORDER BY tll."translationId") FROM translation_listener_totals AS tll), '[]'::jsonb),
      'dailyDownloadUnits', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', daily.day, 'value', daily.value) ORDER BY daily.day) FROM daily_downloads AS daily), '[]'::jsonb),
      'dailyListeningMinutes', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', daily.day, 'value', daily.minutes) ORDER BY daily.day) FROM daily_listening AS daily), '[]'::jsonb),
      'dailyReadingMinutes', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', daily.day, 'value', daily.minutes) ORDER BY daily.day) FROM daily_reading AS daily), '[]'::jsonb),
      'listeningTotalMinutes', COALESCE((SELECT ROUND(SUM(audio.minutes))::integer FROM audio_events AS audio), 0),
      'readingTotalMinutes', COALESCE((SELECT ROUND(SUM(reading.minutes))::integer FROM reading_events AS reading), 0),
      'totalDownloadUnits', COALESCE((SELECT SUM(download.download_units) FROM download_events AS download), 0),
      'totalTrackedSessions', COALESCE((SELECT total FROM session_counts), 0),
      'userCountWithListening', COALESCE((SELECT COUNT(DISTINCT COALESCE(audio.user_id::text, audio.session_id))::integer FROM audio_events AS audio WHERE audio.user_id IS NOT NULL OR audio.session_id IS NOT NULL), 0)
    )
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.get_admin_analytics_overview(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_overview(timestamptz, integer) TO service_role;

-- Keep retained aggregate history on the same elapsed-time definition.
CREATE OR REPLACE FUNCTION public.refresh_analytics_monthly_rollup(
  p_from date DEFAULT (CURRENT_DATE - 45)
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tick_epoch timestamptz;
  affected integer;
BEGIN
  SELECT MIN(created_at) INTO tick_epoch
  FROM public.analytics_events
  WHERE event_name = 'audio_playback_progress'
    AND COALESCE(public.safe_numeric(event_properties->>'listened_ms'), 0) > 0;

  DELETE FROM public.analytics_monthly_rollup WHERE day >= p_from;

  INSERT INTO public.analytics_monthly_rollup
    (day, country_code, translation_id, event_family, minutes, units, event_count, refreshed_at)
  SELECT
    src.day, src.country_code, src.translation_id, src.event_family,
    ROUND(SUM(src.minutes)::numeric, 2), SUM(src.units)::integer, COUNT(*)::integer, now()
  FROM (
    SELECT
      e.created_at::date AS day,
      NULLIF(BTRIM(UPPER(e.geo_country_code)), '') AS country_code,
      NULLIF(BTRIM(LOWER(e.event_properties->>'translation_id')), '') AS translation_id,
      'listening'::text AS event_family,
      CASE
        WHEN e.event_name = 'audio_playback_progress'
          THEN public.analytics_listened_ms(e.event_properties) / 60000.0
        WHEN tick_epoch IS NULL OR e.created_at < tick_epoch
          THEN GREATEST(COALESCE(public.safe_numeric(e.event_properties->>'duration_ms'), 0), 0) / 60000.0
        ELSE 0
      END AS minutes,
      0 AS units
    FROM public.analytics_events e
    WHERE e.event_name IN ('audio_completed', 'audio_playback_progress')
      AND e.created_at::date >= p_from
    UNION ALL
    SELECT
      e.created_at::date,
      NULLIF(BTRIM(UPPER(e.geo_country_code)), ''),
      NULLIF(BTRIM(LOWER(e.event_properties->>'translation_id')), ''),
      'reading'::text,
      GREATEST(COALESCE(public.safe_numeric(e.event_properties->>'duration_seconds'), 0), 0) / 60.0,
      0
    FROM public.analytics_events e
    WHERE e.event_name = 'reading_ended'
      AND e.created_at::date >= p_from
    UNION ALL
    SELECT
      e.created_at::date,
      NULLIF(BTRIM(UPPER(e.geo_country_code)), ''),
      NULLIF(BTRIM(LOWER(e.event_properties->>'translation_id')), ''),
      'download'::text,
      0,
      GREATEST(COALESCE(public.safe_numeric(e.event_properties->>'download_units'), 1), 1)::integer
    FROM public.analytics_events e
    WHERE e.event_name IN ('text_translation_download_completed', 'audio_download_completed')
      AND e.created_at::date >= p_from
  ) AS src
  GROUP BY src.day, src.country_code, src.translation_id, src.event_family;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_analytics_monthly_rollup(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_monthly_rollup(date) TO service_role;
SELECT public.refresh_analytics_monthly_rollup((CURRENT_DATE - interval '13 months')::date);
