-- get_admin_analytics_overview: identical output, ~6x faster.
--
-- The admin dashboard's 180-day call took ~3 s warm (27 s reported cold)
-- against a 27k-row analytics_events table, next to an 8 s authenticator
-- statement timeout. EXPLAIN ANALYZE of the live body (2026-09-24) showed:
--
--   * 2.3 s in the audio_playback_progress branch: public.analytics_listened_ms()
--     costs ~270 us/row. It and public.safe_numeric() both carry
--     `SET search_path` (20260905060000, 20260910091000), so the planner cannot
--     inline them; every call pays a GUC save/restore, and analytics_listened_ms
--     makes up to three nested safe_numeric() calls.
--   * ~350 ms in scoped_events: per-row safe_numeric() calls for the coordinate
--     fallback, plus the flattened coordinate expression being re-evaluated at
--     every reference (five float8->numeric conversions per coordinate per row).
--   * scoped_events carried event.* (every jsonb payload) into a CTE tuplestore
--     that spilled to temp and was re-read by eight downstream CTE scans.
--
-- This is the 20260905060000 body with mechanical changes only; no rollup,
-- filter, join, rounding, ordering or JSON key changes:
--
--   1. safe_numeric() and analytics_listened_ms() are written inline, copying
--      their bodies verbatim (20260910091000 and 20260905060000). This function
--      is SECURITY DEFINER with search_path pinned to public; pg_catalog is
--      searched implicitly first, so BTRIM/ABS/~/::numeric resolve to the same
--      builtins the helpers pin. The helpers are unchanged and still used by
--      refresh_analytics_monthly_rollup. If either helper's definition ever
--      changes, change the inlined copies here too.
--   2. window_events (MATERIALIZED) reads the window once, projecting only the
--      columns later CTEs use and computing each row's coordinates once.
--      scoped_events derives the 0.1-degree buckets from it with the original
--      expressions.
--   3. Each jsonb property is extracted only for the event types whose CTE
--      reads it; every downstream CTE filters on event_name, so the value it
--      sees for its own rows is unchanged. Numeric properties are still parsed
--      inside the per-event-type CTEs, i.e. only for the rows the old body
--      parsed them for.
--
-- Evidence (live, read-only, 2026-09-24; one READ ONLY transaction running the
-- old function and this body with plpgsql variables, as the function will):
--   window  identical jsonb::text  md5 prefix  old ms  new ms
--   1 d     yes                    009de79e        57      21
--   7 d     yes                    2b43f18f       190      53
--   30 d    yes                    ce78fbf9       624     191
--   90 d    yes                    963ff91e      1640     299
--   180 d   yes (x3)               eb7b9d87      3000     500
--
-- Signature, volatility, SECURITY DEFINER, search_path, TimeZone and grants
-- are unchanged, so no client change is needed.
--
-- Risk: low. Pure function replacement; no table or index is touched.
-- Rollback: re-run the CREATE OR REPLACE for this function from
-- 20260905060000_repair_usage_reporting.sql (lines 18-278, plus the REVOKE /
-- GRANT at 281-282). That text is byte-identical to the pre-migration live
-- definition (md5(prosrc) = fc3af4b1f431aa46f7e5f3735ba97f84).

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
  -- Planned as an ordered index scan on idx_analytics_event_created that stops
  -- at the first qualifying row (~0.1 ms), so the helper call here is harmless.
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
    -- One pass over the window. Only the columns the rollups read are carried
    -- (the old event.* dragged every jsonb payload into the CTE tuplestore,
    -- which spilled to temp and was re-read by every downstream CTE scan).
    -- MATERIALIZED so each row's coordinates are computed exactly once: when
    -- this was flattened into scoped_events, the planner substituted the
    -- COALESCE(...::numeric) expression into every reference, i.e. five
    -- float8->numeric conversions per coordinate per row (~130 ms at 27k rows).
    window_events AS MATERIALIZED (
      SELECT
        event.user_id,
        event.session_id,
        event.created_at,
        event.received_at,
        event.event_name,
        event.geo_country_code,
        NULLIF(BTRIM(UPPER(event.geo_country_code)), '') AS column_country_code,
        -- Each property is extracted only for the event types whose CTE below
        -- reads it (every downstream CTE filters on event_name first), so rows
        -- such as session_started skip the jsonb lookups entirely. Numeric
        -- properties stay text here and are parsed in the per-type CTEs,
        -- exactly where the old body parsed them.
        CASE WHEN event.event_name IN ('audio_completed', 'audio_playback_progress', 'text_translation_download_completed', 'audio_download_completed')
          THEN NULLIF(BTRIM(UPPER(event.event_properties->>'geo_country_code')), '') END AS property_country_code,
        CASE WHEN event.event_name IN ('audio_completed', 'audio_playback_progress', 'reading_ended', 'text_translation_download_completed', 'audio_download_completed')
          THEN NULLIF(BTRIM(event.event_properties->>'geo_country_name'), '') END AS country_name,
        CASE WHEN event.event_name IN ('audio_completed', 'text_translation_download_completed', 'audio_download_completed')
          THEN NULLIF(BTRIM(event.event_properties->>'geo_label'), '') END AS geo_label,
        CASE WHEN event.event_name IN ('audio_completed', 'audio_playback_progress', 'reading_ended', 'text_translation_download_completed', 'audio_download_completed')
          THEN NULLIF(BTRIM(LOWER(event.event_properties->>'translation_id')), '') END AS translation_id,
        CASE WHEN event.event_name = 'audio_playback_progress'
          THEN event.event_properties->>'analytics_schema_version' END AS analytics_schema_version,
        CASE WHEN event.event_name = 'audio_playback_progress'
          THEN BTRIM(event.event_properties->>'listened_ms') END AS listened_ms_text,
        CASE WHEN event.event_name = 'audio_playback_progress'
          THEN BTRIM(event.event_properties->>'playback_rate') END AS playback_rate_text,
        CASE WHEN event.event_name = 'audio_completed'
          THEN BTRIM(event.event_properties->>'duration_ms') END AS duration_ms_text,
        CASE WHEN event.event_name = 'reading_ended'
          THEN BTRIM(event.event_properties->>'duration_seconds') END AS duration_seconds_text,
        CASE WHEN event.event_name IN ('text_translation_download_completed', 'audio_download_completed')
          THEN BTRIM(event.event_properties->>'download_units') END AS download_units_text,
        -- Inlined public.safe_numeric() for the coordinate fallback; COALESCE
        -- only evaluates it when the typed column is NULL, as before.
        COALESCE(event.geo_latitude::numeric,
          CASE WHEN raw_coords.latitude_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            CASE WHEN ABS(raw_coords.latitude_text::numeric) <= 1000000000
              THEN raw_coords.latitude_text::numeric ELSE NULL END
          ELSE NULL END) AS latitude,
        COALESCE(event.geo_longitude::numeric,
          CASE WHEN raw_coords.longitude_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            CASE WHEN ABS(raw_coords.longitude_text::numeric) <= 1000000000
              THEN raw_coords.longitude_text::numeric ELSE NULL END
          ELSE NULL END) AS longitude
      FROM public.analytics_events event
      CROSS JOIN LATERAL (
        SELECT
          BTRIM(event.event_properties->>'geo_latitude_bucket') AS latitude_text,
          BTRIM(event.event_properties->>'geo_longitude_bucket') AS longitude_text
      ) raw_coords
      WHERE event.created_at >= window_start AND event.created_at <= window_end
    ),
    scoped_events AS (
      SELECT
        src.user_id, src.session_id, src.created_at, src.received_at, src.event_name,
        src.geo_country_code, src.column_country_code, src.property_country_code,
        src.country_name, src.geo_label, src.translation_id, src.analytics_schema_version,
        src.listened_ms_text, src.playback_rate_text, src.duration_ms_text,
        src.duration_seconds_text, src.download_units_text,
        CASE WHEN src.latitude BETWEEN -90 AND 90 AND src.longitude BETWEEN -180 AND 180
          THEN (FLOOR(src.latitude * 10 + 0.5) / 10)::double precision END AS bucket_latitude,
        CASE WHEN src.latitude BETWEEN -90 AND 90 AND src.longitude BETWEEN -180 AND 180
          THEN (FLOOR(src.longitude * 10 + 0.5) / 10)::double precision END AS bucket_longitude
      FROM window_events AS src
    ),
    audio_candidates AS (
      SELECT
        event.user_id, event.session_id, event.created_at,
        COALESCE(event.column_country_code, event.property_country_code) AS country_code,
        event.country_name,
        event.bucket_latitude AS latitude,
        event.bucket_longitude AS longitude,
        event.geo_label,
        CASE
          WHEN tick_epoch IS NULL OR event.created_at < tick_epoch
            THEN GREATEST(COALESCE(parsed.duration_ms, 0), 0) / 60000.0
          ELSE 0
        END AS minutes,
        event.translation_id
      FROM scoped_events AS event
      CROSS JOIN LATERAL (
        SELECT CASE WHEN event.duration_ms_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            CASE WHEN ABS(event.duration_ms_text::numeric) <= 1000000000
              THEN event.duration_ms_text::numeric ELSE NULL END
          ELSE NULL END AS duration_ms
      ) parsed
      WHERE event.event_name = 'audio_completed'
      UNION ALL
      SELECT
        event.user_id, event.session_id, event.created_at,
        COALESCE(event.column_country_code, event.property_country_code) AS country_code,
        event.country_name,
        event.bucket_latitude AS latitude,
        event.bucket_longitude AS longitude,
        NULL AS geo_label,
        -- Inlined public.analytics_listened_ms(event_properties) / 60000.0.
        GREATEST(COALESCE(parsed.listened_ms, 0), 0) /
          CASE WHEN event.analytics_schema_version = '2' THEN 1
            WHEN parsed.playback_rate BETWEEN 0.25 AND 4
              THEN parsed.playback_rate ELSE 1 END
          / 60000.0 AS minutes,
        event.translation_id
      FROM scoped_events AS event
      CROSS JOIN LATERAL (
        SELECT
          CASE WHEN event.listened_ms_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            CASE WHEN ABS(event.listened_ms_text::numeric) <= 1000000000
              THEN event.listened_ms_text::numeric ELSE NULL END
          ELSE NULL END AS listened_ms,
          CASE WHEN event.playback_rate_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            CASE WHEN ABS(event.playback_rate_text::numeric) <= 1000000000
              THEN event.playback_rate_text::numeric ELSE NULL END
          ELSE NULL END AS playback_rate
      ) parsed
      WHERE event.event_name = 'audio_playback_progress'
        AND COALESCE(parsed.listened_ms, 0) > 0
    ),
    audio_events AS (SELECT * FROM audio_candidates WHERE minutes > 0),
    reading_events AS (
      SELECT
        event.user_id, event.session_id, event.created_at,
        event.column_country_code AS country_code,
        event.bucket_latitude AS latitude, event.bucket_longitude AS longitude,
        event.country_name,
        GREATEST(COALESCE(parsed.duration_seconds, 0), 0) / 60.0 AS minutes,
        event.translation_id
      FROM scoped_events AS event
      CROSS JOIN LATERAL (
        SELECT CASE WHEN event.duration_seconds_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            CASE WHEN ABS(event.duration_seconds_text::numeric) <= 1000000000
              THEN event.duration_seconds_text::numeric ELSE NULL END
          ELSE NULL END AS duration_seconds
      ) parsed
      WHERE event.event_name = 'reading_ended'
        AND COALESCE(parsed.duration_seconds, 0) > 0
    ),
    download_events AS (
      SELECT
        event.user_id, event.session_id, event.created_at,
        COALESCE(event.column_country_code, event.property_country_code) AS country_code,
        event.country_name,
        event.bucket_latitude AS latitude,
        event.bucket_longitude AS longitude,
        event.geo_label,
        GREATEST(COALESCE(parsed.download_units, 1), 1)::integer AS download_units,
        event.translation_id
      FROM scoped_events AS event
      CROSS JOIN LATERAL (
        SELECT CASE WHEN event.download_units_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            CASE WHEN ABS(event.download_units_text::numeric) <= 1000000000
              THEN event.download_units_text::numeric ELSE NULL END
          ELSE NULL END AS download_units
      ) parsed
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
