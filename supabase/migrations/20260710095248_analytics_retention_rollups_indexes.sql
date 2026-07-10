-- P2 S12: analytics retention + monthly rollups + indexes + guarded cron.
--
-- Parts (all additive; the purge is a no-op today — oldest row is 2026-04-01):
--   1. Partial indexes: (user_id, event_name) for engagement aggregation, and a
--      partial (event_name, created_at) restricted to the RPC's event set (kept
--      small as audio_playback_progress at 30s cadence comes to dominate).
--   2. analytics_monthly_rollup: day x country x translation x event_family with
--      minutes/units/counts, so admin history survives the raw-row purge.
--   3. refresh_analytics_monthly_rollup(): rebuilds a rolling recent window
--      (older rows stay finalized, surviving the purge). Listening minutes use
--      the same tick-authoritative semantics as get_admin_analytics_overview
--      (S10): ticks own minutes; audio_completed only counts pre-tick legacy.
--   4. purge_old_analytics_events(): deletes raw rows older than ONE obvious
--      retention constant (13 months).
--   5. A pg_cron-guarded nightly maintenance job that calls the two SQL
--      functions directly (no pg_net/vault needed). It NO-OPS when pg_cron is
--      absent and NEVER touches the existing nightly-aggregate-engagement job.

-- ---------------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_user_event
  ON public.analytics_events (user_id, event_name)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_rpc_events_created
  ON public.analytics_events (event_name, created_at)
  WHERE event_name IN (
    'audio_completed',
    'audio_playback_progress',
    'reading_ended',
    'text_translation_download_completed',
    'audio_download_completed'
  );

-- ---------------------------------------------------------------------------
-- 2. Rollup table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_monthly_rollup (
  day date NOT NULL,
  country_code text,
  translation_id text,
  event_family text NOT NULL CHECK (event_family IN ('listening', 'reading', 'download')),
  minutes numeric NOT NULL DEFAULT 0,
  units integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_monthly_rollup_grain
    UNIQUE NULLS NOT DISTINCT (day, country_code, translation_id, event_family)
);

CREATE INDEX IF NOT EXISTS idx_analytics_monthly_rollup_day
  ON public.analytics_monthly_rollup (day);

ALTER TABLE public.analytics_monthly_rollup ENABLE ROW LEVEL SECURITY;
-- No policies: reachable only via service_role (which bypasses RLS) / admin RPCs.

-- ---------------------------------------------------------------------------
-- 3. Refresh function
-- ---------------------------------------------------------------------------
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
    AND COALESCE(NULLIF(event_properties->>'listened_ms', '')::numeric, 0) > 0;

  -- Rebuild the recent window only; older rows stay finalized (they must
  -- survive the raw-row purge below).
  DELETE FROM public.analytics_monthly_rollup WHERE day >= p_from;

  INSERT INTO public.analytics_monthly_rollup
    (day, country_code, translation_id, event_family, minutes, units, event_count, refreshed_at)
  SELECT
    src.day,
    src.country_code,
    src.translation_id,
    src.event_family,
    ROUND(SUM(src.minutes)::numeric, 2) AS minutes,
    SUM(src.units)::integer AS units,
    COUNT(*)::integer AS event_count,
    now()
  FROM (
    -- listening: ticks own minutes; audio_completed only pre-tick legacy.
    SELECT
      e.created_at::date AS day,
      NULLIF(BTRIM(UPPER(e.geo_country_code)), '') AS country_code,
      NULLIF(BTRIM(LOWER(e.event_properties->>'translation_id')), '') AS translation_id,
      'listening'::text AS event_family,
      CASE
        WHEN e.event_name = 'audio_playback_progress'
          THEN GREATEST(COALESCE(NULLIF(e.event_properties->>'listened_ms', '')::numeric, 0), 0) / 60000.0
        WHEN tick_epoch IS NULL OR e.created_at < tick_epoch
          THEN GREATEST(COALESCE(NULLIF(e.event_properties->>'duration_ms', '')::numeric, 0), 0) / 60000.0
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
      GREATEST(COALESCE(NULLIF(e.event_properties->>'duration_seconds', '')::numeric, 0), 0) / 60.0,
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
      GREATEST(COALESCE(NULLIF(e.event_properties->>'download_units', '')::numeric, 1), 1)::integer
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

-- ---------------------------------------------------------------------------
-- 4. Purge function — single retention constant (13 months).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_analytics_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ONE obvious retention constant. Aggregates in analytics_monthly_rollup are
  -- built BEFORE this runs, so purged raw rows are still represented there.
  retention interval := INTERVAL '13 months';
  affected integer;
BEGIN
  DELETE FROM public.analytics_events
  WHERE created_at < now() - retention;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_analytics_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_analytics_events() TO service_role;

-- ---------------------------------------------------------------------------
-- Initial full backfill of the rollup (all history to date).
-- ---------------------------------------------------------------------------
SELECT public.refresh_analytics_monthly_rollup('2000-01-01'::date);

-- ---------------------------------------------------------------------------
-- 5. Guarded cron — schedule aggregate-then-purge nightly at 02:30 ONLY when
--    pg_cron is present and the job isn't already scheduled. These are pure SQL
--    functions, so no pg_net / vault secret is required (unlike the existing
--    nightly-aggregate-engagement job, which we deliberately leave untouched).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-analytics-maintenance')
  THEN
    PERFORM cron.schedule(
      'nightly-analytics-maintenance',
      '30 2 * * *',
      $cron$SELECT public.refresh_analytics_monthly_rollup(); SELECT public.purge_old_analytics_events();$cron$
    );
  END IF;
END;
$$;
