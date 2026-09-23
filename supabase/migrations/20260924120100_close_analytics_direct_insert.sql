-- M1 (supabase-security-audit-2026-09-24): close the paths that let a signed-in client write
-- analytics_events directly, bypassing the ingestion edge functions' limits (30-day created_at
-- floor clamped to now, 4 KB properties, per-client budget).
--
-- Safe to apply independently of the edge-function deploy. Evidence that nothing legitimate
-- uses these paths (checked read-only against production on 2026-09-24):
--   * The app has sent every event through track-anonymous-usage-events since the unified
--     queue landed on 2026-07-10 (src/services/analytics/usageQueue.ts); src/ has no
--     rpc('batch_track_events') and no from('analytics_events').insert().
--   * Neither batch_track_events nor a direct insert sets received_at; the edge functions do.
--     Since received_at was added (first value 2026-09-11) there are 0 rows without it, so no
--     client build has used either path since.
--   * The only other writer is purge_old_analytics_events() (SECURITY DEFINER, cron-owned).

-- 1. Direct INSERT by `authenticated` (any created_at, any size) -------------------------------
DROP POLICY IF EXISTS events_insert_own ON public.analytics_events;

-- RLS already denies anon/authenticated writes once the policy is gone; revoking the
-- privileges as well means a future permissive policy cannot silently reopen them. TRUNCATE is
-- not subject to RLS at all. SELECT stays for events_select_own.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.analytics_events FROM anon, authenticated;

-- 2. batch_track_events(jsonb): SECURITY DEFINER, unbounded array, caller-chosen created_at ----
-- Kept (not dropped) so this is reversible; only the service role may call it now.
REVOKE EXECUTE ON FUNCTION public.batch_track_events(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batch_track_events(jsonb) TO service_role;

-- 3. Size bounds as a backstop behind the edge functions -------------------------------------
-- The edge functions drop events over 4096 JSON characters of properties or 128 characters in
-- any text field (supabase/functions/_shared/analyticsIngest.ts), so these limits are strictly
-- looser than what they accept and can never turn a valid batch into a failed insert:
--   * pg_column_size of a jsonb object can reach ~6x its JSON text for tiny numeric members,
--     so 64 KB leaves headroom over 4096 characters. Largest stored value today: 332 bytes.
--   * char_length counts code points, never more than JS string length (UTF-16 units).
--     Longest stored text value today: 36 characters.
-- NOT VALID: new and updated rows are checked without a full-table scan on the Micro
-- instance. Every existing row already satisfies them (checked 2026-09-24), so an UPDATE of
-- an old row (e.g. ON DELETE SET NULL of user_id) cannot fail. A created_at-vs-now() CHECK is
-- deliberately NOT used: it would reject exactly those updates on rows older than the window.
ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_properties_bounded CHECK (
    jsonb_typeof(event_properties) = 'object'
    AND pg_column_size(event_properties) <= 65536
  ) NOT VALID;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_text_bounded CHECK (
    char_length(event_name) <= 128
    AND char_length(app_version) <= 128
    AND char_length(device_platform) <= 128
    AND char_length(session_id) <= 128
    AND char_length(geo_country_code) <= 128
    AND char_length(geo_region_code) <= 128
    AND char_length(geo_region_name) <= 128
    AND char_length(geo_city) <= 128
    AND char_length(geo_timezone) <= 128
    AND char_length(geo_source) <= 128
  ) NOT VALID;
