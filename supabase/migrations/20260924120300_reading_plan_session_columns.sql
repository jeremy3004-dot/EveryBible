-- Multi-session plan ticks (morning / midday / evening) follow the account
-- (docs/research/sync-offline-review-2026-09-24.md, "Deferred server work").
--
-- The app keeps, per plan, completed_sessions ({"<day key>:<session>": ISO time})
-- and current_session (the next session to read). The server row had neither,
-- so ticks stayed on the phone that made them.
--
-- Backward compatibility with installed app builds: they never send these
-- columns, so on their upsert's conflict UPDATE the columns are left untouched
-- (a tick synced by a newer build is not wiped), and their inserts get the
-- defaults. They already read completed_sessions/current_session off select('*')
-- rows when present. Newer clients merge the server's ticks with their own
-- (union) before uploading, and detect whether these columns exist from the rows
-- they read, retrying without them if a push is refused (PGRST204/42703).
--
-- Additive: two defaulted columns and a CHECK that admits NULL.

ALTER TABLE public.user_reading_plan_progress
  ADD COLUMN IF NOT EXISTS completed_sessions JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_reading_plan_progress
  ADD COLUMN IF NOT EXISTS current_session TEXT;

ALTER TABLE public.user_reading_plan_progress
  DROP CONSTRAINT IF EXISTS user_reading_plan_progress_current_session_check;
ALTER TABLE public.user_reading_plan_progress
  ADD CONSTRAINT user_reading_plan_progress_current_session_check
  CHECK (current_session IN ('morning', 'midday', 'evening'));
