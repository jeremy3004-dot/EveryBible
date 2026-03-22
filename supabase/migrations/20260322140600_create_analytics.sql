-- Phase 20: Analytics & Engagement Metrics
-- Lightweight event tracking with server-side aggregation

-- Raw event log
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,                    -- 'chapter_opened', 'audio_played', etc.
  event_properties JSONB DEFAULT '{}',         -- {"book": "GEN", "chapter": 1, "duration_ms": 45000}
  session_id TEXT,                              -- client-generated UUID per app session
  device_platform TEXT,                         -- 'ios', 'android'
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_analytics_user_created ON analytics_events(user_id, created_at);
CREATE INDEX idx_analytics_event_created ON analytics_events(event_name, created_at);
CREATE INDEX idx_analytics_created ON analytics_events(created_at);
CREATE INDEX idx_analytics_session ON analytics_events(session_id) WHERE session_id IS NOT NULL;

-- Materialized engagement summary (refreshed by Edge Function cron)
CREATE TABLE IF NOT EXISTS user_engagement_summary (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_chapters_read INTEGER DEFAULT 0,
  total_listening_minutes INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  avg_session_minutes NUMERIC(6,2) DEFAULT 0,
  current_streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,
  last_active_date DATE,
  engagement_score INTEGER DEFAULT 0,          -- computed 0-100
  plans_completed INTEGER DEFAULT 0,
  prayers_submitted INTEGER DEFAULT 0,
  annotations_created INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_engagement_summary ENABLE ROW LEVEL SECURITY;

-- Events: users can insert their own events (write-only from client)
CREATE POLICY "events_insert_own"
  ON analytics_events FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Events: users can read their own events (for debugging/transparency)
CREATE POLICY "events_select_own"
  ON analytics_events FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Engagement summary: users can read their own summary
CREATE POLICY "engagement_select_own"
  ON user_engagement_summary FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Engagement summary: system can upsert (via Edge Function with service role)
-- No user-facing INSERT/UPDATE policy needed; Edge Function uses service_role key

-- RPC to batch-insert analytics events (more efficient than individual inserts)
CREATE OR REPLACE FUNCTION batch_track_events(events JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.analytics_events (user_id, event_name, event_properties, session_id, device_platform, app_version, created_at)
  SELECT
    (select auth.uid()),
    (e->>'event_name')::text,
    COALESCE(e->'event_properties', '{}'::jsonb),
    (e->>'session_id')::text,
    (e->>'device_platform')::text,
    (e->>'app_version')::text,
    COALESCE((e->>'created_at')::timestamptz, NOW())
  FROM jsonb_array_elements(events) AS e;
END;
$$;

GRANT EXECUTE ON FUNCTION batch_track_events(JSONB) TO authenticated;

-- RPC to refresh a single user's engagement summary
CREATE OR REPLACE FUNCTION refresh_my_engagement()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_chapters INTEGER;
  v_listening INTEGER;
  v_sessions INTEGER;
  v_avg_session NUMERIC;
  v_streak INTEGER;
  v_longest_streak INTEGER;
  v_last_active DATE;
  v_plans INTEGER;
  v_prayers INTEGER;
  v_annotations INTEGER;
  v_score INTEGER;
BEGIN
  -- Count chapters read from user_progress
  SELECT COALESCE(jsonb_object_keys_count(chapters_read), 0)
  INTO v_chapters
  FROM (
    SELECT chapters_read FROM public.user_progress WHERE user_id = v_user_id
  ) sub;

  -- Count listening minutes from analytics events
  SELECT COALESCE(SUM((event_properties->>'duration_ms')::bigint) / 60000, 0)
  INTO v_listening
  FROM public.analytics_events
  WHERE user_id = v_user_id AND event_name = 'audio_completed';

  -- Count sessions
  SELECT COUNT(DISTINCT session_id)
  INTO v_sessions
  FROM public.analytics_events
  WHERE user_id = v_user_id AND session_id IS NOT NULL;

  -- Avg session minutes
  SELECT COALESCE(AVG(session_dur), 0)
  INTO v_avg_session
  FROM (
    SELECT session_id, EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 60 AS session_dur
    FROM public.analytics_events
    WHERE user_id = v_user_id AND session_id IS NOT NULL
    GROUP BY session_id
  ) sessions;

  -- Get streak from user_progress
  SELECT COALESCE(streak_days, 0), last_read_date
  INTO v_streak, v_last_active
  FROM public.user_progress
  WHERE user_id = v_user_id;

  v_longest_streak := v_streak; -- simplified; could track historically

  -- Count plans completed
  SELECT COUNT(*)
  INTO v_plans
  FROM public.user_reading_plan_progress
  WHERE user_id = v_user_id AND is_completed = true;

  -- Count prayers submitted
  SELECT COUNT(*)
  INTO v_prayers
  FROM public.prayer_requests
  WHERE user_id = v_user_id;

  -- Count annotations
  SELECT COUNT(*)
  INTO v_annotations
  FROM public.user_annotations
  WHERE user_id = v_user_id AND deleted_at IS NULL;

  -- Compute engagement score (0-100)
  -- Reading 35%, Listening 25%, Streak 20%, Plans 10%, Community 10%
  v_score := LEAST(100, (
    LEAST(35, (v_chapters::numeric / 100 * 35)::integer) +
    LEAST(25, (v_listening::numeric / 500 * 25)::integer) +
    LEAST(20, (v_streak::numeric / 30 * 20)::integer) +
    LEAST(10, (v_plans * 5)) +
    LEAST(10, ((v_prayers + v_annotations)::numeric / 20 * 10)::integer)
  ));

  -- Upsert summary
  INSERT INTO public.user_engagement_summary (
    user_id, total_chapters_read, total_listening_minutes, total_sessions,
    avg_session_minutes, current_streak_days, longest_streak_days,
    last_active_date, engagement_score, plans_completed,
    prayers_submitted, annotations_created, updated_at
  ) VALUES (
    v_user_id, v_chapters, v_listening, v_sessions,
    v_avg_session, v_streak, v_longest_streak,
    v_last_active, v_score, v_plans,
    v_prayers, v_annotations, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_chapters_read = EXCLUDED.total_chapters_read,
    total_listening_minutes = EXCLUDED.total_listening_minutes,
    total_sessions = EXCLUDED.total_sessions,
    avg_session_minutes = EXCLUDED.avg_session_minutes,
    current_streak_days = EXCLUDED.current_streak_days,
    longest_streak_days = GREATEST(public.user_engagement_summary.longest_streak_days, EXCLUDED.longest_streak_days),
    last_active_date = EXCLUDED.last_active_date,
    engagement_score = EXCLUDED.engagement_score,
    plans_completed = EXCLUDED.plans_completed,
    prayers_submitted = EXCLUDED.prayers_submitted,
    annotations_created = EXCLUDED.annotations_created,
    updated_at = NOW();
END;
$$;

-- Helper to count JSONB keys (used in refresh_my_engagement)
CREATE OR REPLACE FUNCTION jsonb_object_keys_count(obj JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COUNT(*)::integer FROM jsonb_object_keys(COALESCE(obj, '{}'::jsonb));
$$;

GRANT EXECUTE ON FUNCTION refresh_my_engagement() TO authenticated;
