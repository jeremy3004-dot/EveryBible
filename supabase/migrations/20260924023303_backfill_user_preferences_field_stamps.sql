-- Stamp the preference rows that app builds have already written, so the
-- per-field merge can tell a real choice from a DB default
-- (docs/research/sync-offline-review-2026-09-24.md, finding 8). Requires
-- 20260924023259 (the column and its trigger); apply the two together.
--
-- Every account's row is created by handle_new_user with DB defaults (theme
-- 'dark', onboarding_completed false, ...). Those values were never chosen and
-- must not beat a device's settings on first sign-in, so they stay unstamped.
-- A row an app build has upserted holds values a device chose (the old client
-- always wrote the whole row), so every column gets that upload's time: the
-- same whole-row clock those builds merged on.
--
-- Telling the two apart: handle_new_user inserts profiles and user_preferences
-- in one transaction, so an untouched row's synced_at equals profiles.created_at
-- exactly (both DEFAULT now()). Every client upsert sends its own synced_at.
-- On 2026-09-24 production had 25 rows: 15 untouched, 10 client-written.
--
-- Additive and idempotent: only field_updated_at changes, and stamps the trigger
-- already recorded (writes that landed after 20260924023259) take precedence.

UPDATE public.user_preferences AS prefs
SET field_updated_at = (
  SELECT jsonb_object_agg(
    col,
    to_char(date_trunc('milliseconds', prefs.synced_at) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM unnest(ARRAY[
    'font_size', 'theme', 'appearance_palette', 'language', 'country_code',
    'country_name', 'content_language_code', 'content_language_name',
    'content_language_native_name', 'chapter_feedback_name', 'chapter_feedback_role',
    'onboarding_completed', 'chapter_feedback_enabled', 'hide_play_button_from_reading_tab',
    'notifications_enabled', 'reminder_time'
  ]) AS col
) || prefs.field_updated_at
FROM public.profiles AS profile
WHERE profile.id = prefs.user_id
  AND prefs.synced_at IS NOT NULL
  AND prefs.synced_at IS DISTINCT FROM profile.created_at;
