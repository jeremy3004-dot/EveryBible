-- Account deletion: remove what a deleted account leaves behind, and stop one
-- foreign key from blocking the deletion. See
-- docs/research/account-deletion-data-map-2026-09-24.md for the full map.
--
-- Deleting auth.users cascades to public.profiles and from there to every
-- per-user table. Three things fell outside that:
--
-- 1. group_reading_plans.assigned_by referenced profiles with NO ACTION. Only
--    the group leader can assign a plan, and deleting the leader deletes the
--    group, so this held until leadership is handed over: the former leader's
--    assignment then blocks their account deletion with a foreign-key error.
--    The assignment belongs to the group, so it keeps the plan and loses the
--    author.
-- 2. chapter_feedback_submissions keeps the feedback text of a deleted account
--    by design (user_id ON DELETE SET NULL), but the rows also copy the
--    contributor's name, ID number and IP hash, which the null user_id did not
--    touch. The row also kept the path of the recorded answer, whose file the
--    app removes before calling delete_my_account(); the path names the uid.
-- 3. Tables in the `backups` schema, taken before live data fixes, hold copies
--    of per-user rows (preferences with the feedback name and ID number,
--    plan progress, engagement) with no foreign key, so they outlive the
--    account.
--
-- The cleanup is a trigger on profiles, not code in delete_my_account(), so it
-- also runs when an account is deleted from the dashboard or the admin API.

ALTER TABLE public.group_reading_plans
  ALTER COLUMN assigned_by DROP NOT NULL;

ALTER TABLE public.group_reading_plans
  DROP CONSTRAINT group_reading_plans_assigned_by_fkey,
  ADD CONSTRAINT group_reading_plans_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.forget_deleted_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  backup_table record;
BEGIN
  -- Keep the feedback itself (sentiment, comment, role, category, council
  -- resolution) for the translators; drop what identifies the person.
  UPDATE public.chapter_feedback_submissions
  SET participant_name = NULL,
      participant_id_number = NULL,
      client_ip_hash = NULL,
      audio_response_bucket = NULL,
      audio_response_path = NULL,
      audio_response_mime_type = NULL,
      audio_response_size_bytes = NULL,
      audio_response_duration_ms = NULL,
      audio_response_created_at = NULL
  WHERE user_id = OLD.id;

  -- Backup tables come and go, so find them at deletion time.
  FOR backup_table IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid
    WHERE namespace.nspname = 'backups'
      AND relation.relkind IN ('r', 'p')
      AND attribute.attname = 'user_id'
      AND attribute.atttypid = 'uuid'::pg_catalog.regtype
      AND NOT attribute.attisdropped
  LOOP
    EXECUTE pg_catalog.format(
      'DELETE FROM %I.%I WHERE user_id = $1',
      backup_table.schema_name,
      backup_table.table_name
    ) USING OLD.id;
  END LOOP;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.forget_deleted_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS forget_deleted_profile ON public.profiles;
CREATE TRIGGER forget_deleted_profile
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.forget_deleted_profile();
