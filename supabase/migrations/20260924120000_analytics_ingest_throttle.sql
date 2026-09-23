-- M1 (supabase-security-audit-2026-09-24): per-client budget for the analytics ingestion edge
-- functions, plus a cache of the IP geo lookup so a flood cannot multiply ipinfo spend.
--
-- Apply BEFORE deploying the updated track-anonymous-usage-events / track-analytics-events.
-- (If the functions ship first they still work: the limiter fails open for writes and closed
-- for paid geo lookups until this RPC exists.)
--
-- Cost on a Micro instance: one row per distinct client key (salted IP hash or user hash), one
-- upsert per ingest request. The table is UNLOGGED: counters and cached geo are disposable, so
-- they generate no WAL and are simply emptied after a crash. Stale rows are pruned
-- opportunistically by the budget function itself; no cron job is needed.

CREATE UNLOGGED TABLE IF NOT EXISTS public.analytics_ingest_throttle (
  client_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  byte_count bigint NOT NULL DEFAULT 0,
  -- Last approximate IP geo result for this key (country / city / rounded coordinates). Only
  -- the salted key is stored, never the raw address.
  geo jsonb,
  geo_cached_at timestamptz,
  geo_claimed_at timestamptz,
  CONSTRAINT analytics_ingest_throttle_key_length CHECK (char_length(client_key) <= 128)
);

CREATE INDEX IF NOT EXISTS analytics_ingest_throttle_window_idx
  ON public.analytics_ingest_throttle (window_started_at);

ALTER TABLE public.analytics_ingest_throttle ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) reads or writes this table.
REVOKE ALL ON TABLE public.analytics_ingest_throttle FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analytics_ingest_throttle TO service_role;

COMMENT ON TABLE public.analytics_ingest_throttle IS
  'Fixed-window ingest budget and cached IP geo per analytics client key (salted hash). Service role only.';

-- Charges one request of p_event_count events / p_byte_count bytes to p_client_key and reports
-- whether it fits the window budget. Also hands back a still-fresh cached geo result, or claims
-- the single external lookup this key may make (bounded globally by p_max_geo_lookups per
-- window). The row lock taken by the upsert serialises concurrent requests for one key, so a
-- burst from one source claims at most one lookup.
CREATE OR REPLACE FUNCTION public.consume_analytics_ingest_budget(
  p_client_key text,
  p_event_count integer,
  p_byte_count integer,
  p_window_seconds integer,
  p_max_requests integer,
  p_max_events integer,
  p_max_bytes integer,
  p_geo_ttl_seconds integer,
  p_max_geo_lookups integer
)
RETURNS TABLE (
  allowed boolean,
  retry_after_seconds integer,
  cached_geo jsonb,
  claim_geo_lookup boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_row public.analytics_ingest_throttle;
  v_global_ok boolean := false;
BEGIN
  INSERT INTO public.analytics_ingest_throttle AS t
    (client_key, window_started_at, request_count, event_count, byte_count)
  VALUES (p_client_key, now(), 1, greatest(p_event_count, 0), greatest(p_byte_count, 0))
  ON CONFLICT (client_key) DO UPDATE SET
    window_started_at = CASE WHEN t.window_started_at <= now() - v_window
      THEN now() ELSE t.window_started_at END,
    request_count = CASE WHEN t.window_started_at <= now() - v_window
      THEN 1 ELSE t.request_count + 1 END,
    event_count = CASE WHEN t.window_started_at <= now() - v_window
      THEN excluded.event_count ELSE t.event_count + excluded.event_count END,
    byte_count = CASE WHEN t.window_started_at <= now() - v_window
      THEN excluded.byte_count ELSE t.byte_count + excluded.byte_count END
  RETURNING * INTO v_row;

  allowed := v_row.request_count <= p_max_requests
    AND v_row.event_count <= p_max_events
    AND v_row.byte_count <= p_max_bytes;
  retry_after_seconds := CASE WHEN allowed THEN 0 ELSE greatest(
    1, ceil(extract(epoch FROM (v_row.window_started_at + v_window - now())))::integer
  ) END;
  cached_geo := CASE
    WHEN v_row.geo_cached_at > now() - make_interval(secs => greatest(p_geo_ttl_seconds, 0))
      THEN v_row.geo
  END;
  claim_geo_lookup := false;

  IF allowed AND cached_geo IS NULL
    AND (v_row.geo_claimed_at IS NULL OR v_row.geo_claimed_at <= now() - interval '1 minute')
  THEN
    INSERT INTO public.analytics_ingest_throttle AS t
      (client_key, window_started_at, request_count)
    VALUES ('global:geo-lookups', now(), 1)
    ON CONFLICT (client_key) DO UPDATE SET
      window_started_at = CASE WHEN t.window_started_at <= now() - v_window
        THEN now() ELSE t.window_started_at END,
      request_count = CASE WHEN t.window_started_at <= now() - v_window
        THEN 1 ELSE t.request_count + 1 END
    RETURNING t.request_count <= p_max_geo_lookups INTO v_global_ok;

    IF v_global_ok THEN
      UPDATE public.analytics_ingest_throttle
        SET geo_claimed_at = now()
        WHERE client_key = p_client_key;
      claim_geo_lookup := true;
    END IF;
  END IF;

  -- Opportunistic pruning (~1 in 200 calls) keeps the table to recently active keys.
  IF random() < 0.005 THEN
    DELETE FROM public.analytics_ingest_throttle
      WHERE window_started_at < now() - interval '1 day'
        AND client_key <> 'global:geo-lookups';
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_analytics_ingest_budget(
  text, integer, integer, integer, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_analytics_ingest_budget(
  text, integer, integer, integer, integer, integer, integer, integer, integer
) TO service_role;
