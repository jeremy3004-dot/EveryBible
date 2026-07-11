-- Review B1 (pre-ship hardening): bound the MAGNITUDE of safe_numeric(), not just
-- its FORMAT. Supersedes the format-only guard added in
-- 20260710102135_harden_analytics_numeric_casts_safe_numeric.sql.
--
-- The 20260710102135 guard only regex-validated shape (^-?[0-9]+(\.[0-9]+)?$), so a
-- huge but well-formed integer string still parsed to numeric and then overflowed
-- the downstream fixed-width casts (Postgres SQLSTATE 22003, "value out of range").
-- Because track-anonymous-usage-events (verify_jwt=false) passes event_properties
-- through untouched, ONE credential-free POST such as
--   {"event_name":"audio_download_completed",
--    "event_properties":{"download_units":"3000000000"}}
-- would break get_admin_analytics_overview (admin dashboard) AND — since the nightly
-- cron runs `refresh_analytics_monthly_rollup(); purge_old_analytics_events();` as a
-- single command (20260710095248) — block the purge too, until the row was hand-deleted.
--
-- Overflow sites this closes (both were fed by safe_numeric()):
--   * `::integer` (int4, max 2,147,483,647):
--       - 20260710150000_analytics_authoritative_listener_counts.sql:101
--         GREATEST(COALESCE(public.safe_numeric(...download_units), 1), 1)::integer
--         (download_events in get_admin_analytics_overview)
--       - 20260710102135_harden_analytics_numeric_casts_safe_numeric.sql:87
--         the same download_units expression in refresh_analytics_monthly_rollup
--       - the ROUND(SUM(minutes))::integer / SUM(units)::integer rollups
--         (20260710150000:243 / 20260710102135:51), whose per-row inputs come from
--         safe_numeric(listened_ms|duration_ms|duration_seconds)
--   * `::double precision` minute math fed by the same safe_numeric() values.
--
-- Fix: safe_numeric() now ALSO returns NULL when the parsed magnitude is outside a
-- safe range (abs value > 1e9). The reporting functions COALESCE the NULL to 0/1
-- exactly as they already do for malformed input, so a poison value is simply
-- ignored. 1e9 comfortably covers every legitimate field this guards — listened_ms /
-- duration_ms are per-event playback durations (a full 24h day is only 86,400,000 ms),
-- duration_seconds is a per-session reading duration, and download_units is 1 per
-- event — while staying safely under int4 (2.1e9) so every `::integer` cast succeeds.
--
-- Only safe_numeric() is re-created. Both reporting functions call it by reference
-- (public.safe_numeric(...)), so the bound propagates to
-- get_admin_analytics_overview and refresh_analytics_monthly_rollup without editing
-- their bodies — the fewest functions changed while closing both cast classes.
--
-- The geo_*_bucket lat/lng `::double precision` casts (e.g. 20260710150000:57-58) use
-- their own inline regex, NOT safe_numeric, and float8 cannot raise 22003 (its range
-- is ~1e308); they are left untouched, matching the 20260710102135 note.
--
-- Valid-data totals are unchanged (known-good: listening 4304, reading 1348,
-- downloads 179) — the clamp only rejects values far outside any real reading/
-- listening/download measurement.

-- NOTE on structure: the magnitude comparison is NESTED inside the regex WHEN's
-- THEN branch rather than combined with `AND`. Postgres does NOT guarantee that
-- `AND` short-circuits left-to-right, so `regex AND ABS(txt::numeric) <= 1e9`
-- could evaluate the `::numeric` cast on malformed input (e.g. 'abc') and raise
-- 22P02 — reintroducing the very throw this guard prevents. A CASE THEN branch is
-- only evaluated when its WHEN is true, so nesting the cast there is safe.
CREATE OR REPLACE FUNCTION public.safe_numeric(txt text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN BTRIM(txt) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      CASE
        WHEN ABS(BTRIM(txt)::numeric) <= 1000000000  -- 1e9: under int4 max, above any legit value
          THEN BTRIM(txt)::numeric
        ELSE NULL
      END
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.safe_numeric(text) FROM PUBLIC, anon, authenticated;
