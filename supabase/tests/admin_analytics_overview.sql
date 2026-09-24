-- get_admin_analytics_overview behaviour regression. Run against a local or linked
-- database as postgres; every fixture rolls back.
--
-- Fixtures live in a January 2001 window so no real event overlaps them. They pin
-- the rules 20260924112156 inlined from public.safe_numeric() and
-- public.analytics_listened_ms(): trimming, the numeric regex, the 1e9 magnitude
-- cap, playback-rate normalisation, analytics_schema_version 2, and the
-- audio_completed cutoff at the first audio_playback_progress tick.
BEGIN;
SET LOCAL statement_timeout = '10s';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_admin_analytics_overview(timestamptz, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_admin_analytics_overview(timestamptz, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Client roles must not execute get_admin_analytics_overview';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.get_admin_analytics_overview(timestamptz, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute get_admin_analytics_overview';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.analytics_events
    WHERE created_at >= '2001-01-01T00:00:00Z' AND created_at < '2001-01-04T00:00:00Z'
  ) THEN
    RAISE EXCEPTION 'Fixture window 2001-01-01..03 already holds events; pick another window';
  END IF;
END;
$$;

INSERT INTO public.analytics_events
  (event_name, session_id, created_at, geo_country_code, geo_latitude, geo_longitude, event_properties)
VALUES
  -- Before the first progress tick: counts duration_ms (2 min). Coordinates come
  -- from the property fallback because the typed columns are NULL.
  ('audio_completed', 's-complete', '2001-01-01T10:00:00Z', ' us ', NULL, NULL,
    '{"duration_ms": "120000", "translation_id": "BSB", "geo_latitude_bucket": "12.34", "geo_longitude_bucket": "56.78", "geo_label": "Fixture town"}'),
  -- First tick. Old clients recorded media time: 90000 / 1.5 = 60000 ms = 1 min.
  ('audio_playback_progress', 's-progress', '2001-01-02T10:00:00Z', 'US', 12.3, 56.8,
    '{"listened_ms": "90000", "playback_rate": "1.5", "translation_id": "bsb"}'),
  -- Schema 2 records elapsed time, so playback_rate is ignored; value is trimmed.
  ('audio_playback_progress', 's-progress', '2001-01-02T11:00:00Z', 'US', 12.3, 56.8,
    '{"listened_ms": " 60000 ", "playback_rate": "2", "analytics_schema_version": "2", "translation_id": "bsb"}'),
  -- Rejected by the numeric parser: not a number, exponent form, over the 1e9 cap.
  ('audio_playback_progress', 's-progress', '2001-01-02T12:00:00Z', 'US', 12.3, 56.8,
    '{"listened_ms": "abc", "translation_id": "bsb"}'),
  ('audio_playback_progress', 's-progress', '2001-01-02T12:01:00Z', 'US', 12.3, 56.8,
    '{"listened_ms": "1e5", "translation_id": "bsb"}'),
  ('audio_playback_progress', 's-progress', '2001-01-02T12:02:00Z', 'US', 12.3, 56.8,
    '{"listened_ms": "2000000000", "translation_id": "bsb"}'),
  -- After the first tick, audio_completed contributes nothing (avoids double counting).
  ('audio_completed', 's-late', '2001-01-03T10:00:00Z', 'US', 12.3, 56.8,
    '{"duration_ms": "600000", "translation_id": "bsb"}'),
  -- Reading uses only the typed country column: 300 s = 5 min.
  ('reading_ended', 's-read', '2001-01-01T12:00:00Z', 'GB', 51.5, -0.1,
    '{"duration_seconds": "300", "translation_id": "web", "geo_country_code": "FR"}'),
  -- Download units default to 1 when unparseable.
  ('text_translation_download_completed', 's-dl', '2001-01-03T09:00:00Z', 'US', 12.3, 56.8,
    '{"download_units": "x", "translation_id": "bsb"}'),
  ('audio_download_completed', 's-dl', '2001-01-03T09:05:00Z', 'US', 12.3, 56.8,
    '{"download_units": "3", "translation_id": "bsb"}'),
  ('session_started', 's-a', '2001-01-01T08:00:00Z', NULL, NULL, NULL, '{}'),
  ('session_started', 's-a', '2001-01-01T08:01:00Z', NULL, NULL, NULL, '{}'),
  ('session_started', 's-b', '2001-01-02T08:00:00Z', NULL, NULL, NULL, '{}');

DO $$
DECLARE
  result jsonb := public.get_admin_analytics_overview('2001-01-01T00:00:00Z', 3);
  daily_listening numeric[];
BEGIN
  IF (result->>'listeningTotalMinutes')::int IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'listeningTotalMinutes: expected 4, got %', result->>'listeningTotalMinutes';
  END IF;
  IF (result->>'readingTotalMinutes')::int IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'readingTotalMinutes: expected 5, got %', result->>'readingTotalMinutes';
  END IF;
  IF (result->>'totalDownloadUnits')::int IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'totalDownloadUnits: expected 4, got %', result->>'totalDownloadUnits';
  END IF;
  IF (result->>'totalTrackedSessions')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'totalTrackedSessions: expected 2, got %', result->>'totalTrackedSessions';
  END IF;
  IF (result->>'userCountWithListening')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'userCountWithListening: expected 2, got %', result->>'userCountWithListening';
  END IF;
  IF (result->'collectionHealth'->>'eventCount')::int IS DISTINCT FROM 13 THEN
    RAISE EXCEPTION 'eventCount: expected 13, got %', result->'collectionHealth'->>'eventCount';
  END IF;

  SELECT array_agg((day->>'value')::numeric ORDER BY day->>'day')
  INTO daily_listening
  FROM jsonb_array_elements(result->'dailyListeningMinutes') AS day;
  IF daily_listening IS DISTINCT FROM ARRAY[2.0, 2.0, 0]::numeric[] THEN
    RAISE EXCEPTION 'dailyListeningMinutes: expected {2.0,2.0,0}, got %', daily_listening;
  END IF;

  IF result->'translationListeningMinutes' IS DISTINCT FROM
     '[{"translationId": "bsb", "listeningMinutes": 4.0}]'::jsonb THEN
    RAISE EXCEPTION 'translationListeningMinutes: got %', result->'translationListeningMinutes';
  END IF;

  -- Reading attributes to the typed column (GB), never the property (FR); the
  -- audio_completed row's padded ' us ' column is normalised to US.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(result->'countryMetrics') AS c
    WHERE c->>'code' = 'GB' AND (c->>'readingMinutes')::numeric = 5
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(result->'countryMetrics') AS c WHERE c->>'code' = 'FR'
  ) THEN
    RAISE EXCEPTION 'countryMetrics reading attribution: got %', result->'countryMetrics';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(result->'countryMetrics') AS c
    WHERE c->>'code' = 'US' AND (c->>'listeningMinutes')::numeric = 4.0
      AND (c->>'downloadUnits')::int = 4 AND (c->>'listenerCount')::int = 2
  ) THEN
    RAISE EXCEPTION 'countryMetrics US: got %', result->'countryMetrics';
  END IF;

  -- The fallback coordinates (12.34, 56.78) bucket to the same 0.1-degree cell
  -- as the typed ones (12.3, 56.8), so all US activity lands in one location
  -- that keeps the audio_completed geo_label.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(result->'locationMetrics') AS l
    WHERE l->>'key' = '12.3:56.8:US' AND l->>'label' = 'Fixture town'
      AND (l->>'listeningMinutes')::numeric = 4.0 AND (l->>'downloadUnits')::int = 4
  ) THEN
    RAISE EXCEPTION 'locationMetrics: got %', result->'locationMetrics';
  END IF;
END;
$$;

SELECT 'PASS: get_admin_analytics_overview parses, normalises and attributes fixture events' AS result;
ROLLBACK;
