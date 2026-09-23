-- Support user detail: session count.
--
-- The admin dashboard used to select session_id rows from analytics_events and
-- count the distinct values in JavaScript. That was wrong twice over: PostgREST
-- caps the returned rows, so a busy account was silently truncated, and it
-- counted every event type instead of app visits. METRICS.md defines a tracked
-- session as a distinct `session_started.session_id`, so count it in SQL.
--
-- Applied live via MCP on 2026-09-10; file recovered from
-- supabase_migrations.schema_migrations on 2026-09-24.

CREATE OR REPLACE FUNCTION public.count_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(DISTINCT session_id)::integer
  FROM public.analytics_events
  WHERE user_id = p_user_id
    AND event_name = 'session_started'
    AND session_id IS NOT NULL;
$$;

-- Admin-only: reachable through the service-role dashboard client, never from
-- an app session.
REVOKE ALL ON FUNCTION public.count_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_user_sessions(uuid) TO service_role;
