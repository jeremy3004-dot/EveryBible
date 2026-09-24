-- Per-field edit stamps for user_preferences, so the newest EDIT of each setting
-- wins across devices instead of the newest UPLOAD of the whole row
-- (docs/research/sync-offline-review-2026-09-24.md, finding 7).
--
-- field_updated_at maps a preference column name to the ISO time that value was
-- chosen: {"theme": "2026-09-24T10:00:00.000Z", ...}. A column with no key has
-- never been chosen by anyone (it still holds the DB default).
--
-- Backward compatibility with installed app builds. Those builds upsert every
-- preference column plus synced_at and know nothing about field_updated_at, so on
-- conflict the column is left out of the UPDATE and NEW.field_updated_at equals
-- OLD.field_updated_at. The trigger treats that as a legacy write: the values it
-- changed are accepted exactly as before and stamped with the server time, so a
-- newer client sees them as fresh edits and nothing an old build writes is lost
-- or silently reverted. Their inserts still succeed (the column has a default).
--
-- Newer clients send field_updated_at. For them the server is the tie-breaker:
-- a value whose incoming stamp is not newer than the stored one is refused per
-- field (the stored value and stamp stay), so two devices racing the
-- read-merge-write cannot let an older edit overwrite a newer one.
--
-- Clock skew: a stamp later than the server's now() is clamped to now(), so a
-- device whose clock runs fast cannot pin a setting into the future. A slow
-- clock only makes that device's own edits look older than they were; the
-- server cannot know the real edit time. Stamps are stored at millisecond
-- precision in the same "YYYY-MM-DDTHH:MM:SS.mmmZ" shape as JavaScript's
-- toISOString(), so clients can compare them directly.
--
-- Everything is additive: one defaulted column and one trigger. No existing
-- value is rewritten here (the backfill for rows old builds already wrote is
-- 20260924120100).

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS field_updated_at JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.stamp_user_preference_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Every client-synced preference column. Keep in step with
  -- PREFERENCE_COLUMNS in src/services/sync/syncMerge.ts (a test pins this list).
  tracked CONSTANT text[] := ARRAY[
    'font_size', 'theme', 'appearance_palette', 'language', 'country_code',
    'country_name', 'content_language_code', 'content_language_name',
    'content_language_native_name', 'chapter_feedback_name', 'chapter_feedback_role',
    'onboarding_completed', 'chapter_feedback_enabled', 'hide_play_button_from_reading_tab',
    'notifications_enabled', 'reminder_time'
  ];
  server_now CONSTANT timestamptz := date_trunc('milliseconds', now());
  incoming jsonb := COALESCE(NEW.field_updated_at, '{}'::jsonb);
  stored jsonb := '{}'::jsonb;
  new_values jsonb := to_jsonb(NEW);
  old_values jsonb;
  legacy_writer boolean := false;
  refused jsonb := '{}'::jsonb;
  stamps jsonb := '{}'::jsonb;
  col text;
  raw text;
  incoming_at timestamptz;
  stored_at timestamptz;
  kept_at timestamptz;
BEGIN
  IF jsonb_typeof(incoming) IS DISTINCT FROM 'object' THEN
    incoming := '{}'::jsonb;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_values := to_jsonb(OLD);
    stored := COALESCE(OLD.field_updated_at, '{}'::jsonb);
    legacy_writer := NEW.field_updated_at IS NOT DISTINCT FROM OLD.field_updated_at;
  END IF;

  FOREACH col IN ARRAY tracked LOOP
    incoming_at := NULL;
    stored_at := NULL;

    raw := incoming ->> col;
    IF raw IS NOT NULL THEN
      BEGIN
        incoming_at := LEAST(date_trunc('milliseconds', raw::timestamptz), server_now);
      EXCEPTION WHEN others THEN
        incoming_at := NULL; -- a malformed stamp counts as no stamp
      END;
    END IF;

    raw := stored ->> col;
    IF raw IS NOT NULL THEN
      BEGIN
        stored_at := raw::timestamptz;
      EXCEPTION WHEN others THEN
        stored_at := NULL;
      END;
    END IF;

    IF TG_OP = 'INSERT' THEN
      kept_at := incoming_at;
    ELSIF legacy_writer THEN
      -- An installed build that does not know the column: accept its values as
      -- before, and stamp what it changed with the time it reached the server.
      kept_at := CASE
        WHEN new_values -> col IS DISTINCT FROM old_values -> col THEN server_now
        ELSE stored_at
      END;
    ELSIF new_values -> col IS DISTINCT FROM old_values -> col
      AND stored_at IS NOT NULL
      AND (incoming_at IS NULL OR incoming_at <= stored_at) THEN
      -- The writer's knowledge of this setting is older than the server's.
      refused := refused || jsonb_build_object(col, old_values -> col);
      kept_at := stored_at;
    ELSE
      kept_at := GREATEST(incoming_at, stored_at);
    END IF;

    IF kept_at IS NOT NULL THEN
      stamps := stamps || jsonb_build_object(
        col,
        to_char(kept_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      );
    END IF;
  END LOOP;

  IF refused <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, refused);
  END IF;
  NEW.field_updated_at := stamps;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_user_preference_edits() IS
  'Keeps user_preferences.field_updated_at: clamps future stamps, stamps legacy (stamp-less) '
  'writes with the server time, and refuses per field a value whose stamp is not newer.';

DROP TRIGGER IF EXISTS stamp_user_preference_edits ON public.user_preferences;
CREATE TRIGGER stamp_user_preference_edits
  BEFORE INSERT OR UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.stamp_user_preference_edits();
