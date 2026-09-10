-- M2 (live advisor WARN: function_search_path_mutable)
--
-- public.jsonb_object_keys_count(jsonb) and public.safe_numeric(text) were both created
-- without a pinned search_path:
--   * jsonb_object_keys_count — 20260322140600_create_analytics.sql:199
--   * safe_numeric            — 20260711100000_bound_safe_numeric_magnitude.sql:55
--     (which superseded 20260710102135_harden_analytics_numeric_casts_safe_numeric.sql:15)
--
-- Neither is SECURITY DEFINER, so this is hardening rather than an active privilege
-- escalation: the risk is that a caller with a mutable search_path (or a SECURITY DEFINER
-- caller that inlines them) can shadow the unqualified operators/functions in these bodies
-- — `jsonb_object_keys`, `BTRIM`, `ABS`, the `~` regex operator, the `::numeric` cast — with
-- objects from a schema they control. Both functions are also IMMUTABLE, and an IMMUTABLE
-- function whose meaning depends on the session search_path is unsound for index/plan
-- caching regardless of security.
--
-- Fix: re-create both with byte-identical bodies plus `SET search_path = pg_catalog, public`.
-- pg_catalog first so every builtin above resolves from the system catalog; public retained
-- because these live in public and callers reference them as public.<name>(...). Volatility
-- (IMMUTABLE) and PARALLEL SAFE are preserved exactly, so no calling plan changes.
--
-- CREATE OR REPLACE keeps the existing ACL, but safe_numeric's REVOKE is re-applied below
-- anyway so the file is self-contained and safe to replay. Nothing else changes: the
-- reporting functions (get_admin_analytics_overview, refresh_analytics_monthly_rollup,
-- refresh_my_engagement) call these by reference and are untouched.
--
-- PLANNER TRADE-OFF (accepted): a SQL function carrying a SET clause can no longer be
-- inlined by the planner, so safe_numeric() becomes a real per-row function call inside
-- the analytics rollups instead of being folded into the expression. These rollups run
-- nightly over a small events table and are not on any user-facing path, so the correctness
-- and hardening win is worth the lost inlining. If a rollup ever regresses, the alternative
-- is to drop the SET clause and fully schema-qualify every builtin in the body instead.

-- Body copied verbatim from 20260322140600_create_analytics.sql:199-205 (schema-qualified
-- name added; the advisor reports it as public.jsonb_object_keys_count(jsonb)).
CREATE OR REPLACE FUNCTION public.jsonb_object_keys_count(obj JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COUNT(*)::integer FROM jsonb_object_keys(COALESCE(obj, '{}'::jsonb));
$$;

-- Body copied verbatim from 20260711100000_bound_safe_numeric_magnitude.sql:55-70.
-- NOTE (carried forward from that migration): the magnitude comparison stays NESTED inside
-- the regex WHEN's THEN branch rather than combined with AND. Postgres does not guarantee
-- that AND short-circuits left-to-right, so `regex AND ABS(txt::numeric) <= 1e9` could
-- evaluate the ::numeric cast on malformed input and raise 22P02. A CASE THEN branch is
-- only evaluated when its WHEN is true, so nesting the cast there is safe.
CREATE OR REPLACE FUNCTION public.safe_numeric(txt text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
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

-- Re-assert the lockdown from 20260711100000: safe_numeric is an internal reporting helper
-- and must never be reachable from a client role via PostgREST RPC.
REVOKE ALL ON FUNCTION public.safe_numeric(text) FROM PUBLIC, anon, authenticated;
