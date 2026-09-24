-- Leaving a reading plan on one phone must not be undone by another
-- (docs/research/sync-offline-review-2026-09-24.md, finding 9).
--
-- Until now an unenrol DELETEd the user_reading_plan_progress row. A second
-- device that still had the plan could not tell "deleted elsewhere" from "never
-- pushed", so its next sync upserted the row back and the first device's next
-- pull re-enrolled it.
--
-- A tombstone table records when each plan was left: (user_id, plan_slug,
-- unenrolled_at). It is a separate table rather than a column on the progress
-- row so the INSTALLED app builds, which select('*') progress rows and treat
-- every row as an enrolment, never see a left plan as enrolled.
--
-- The rule, enforced server-side for every client:
--   An enrolment whose started_at is at or before the plan's unenrolled_at has
--   ended. Its row is deleted when the tombstone is written, and any later
--   insert or update carrying such a started_at is silently skipped. A real
--   re-enrolment starts after the tombstone and is accepted.
--
-- Backward compatibility with installed builds:
--   * Their unenrol still issues a DELETE on the progress row; a trigger turns
--     that delete into a tombstone, so their leaves propagate too.
--   * Their stale upserts of a left plan are skipped (the BEFORE trigger returns
--     NULL). pushProgressToRemote's .single() then reports no row and the build
--     swallows it, as it does any failed push; syncPlanProgress simply gets
--     fewer rows back. Their other writes are unaffected.
--
-- Clock skew: started_at is written by the device clock. It is clamped to the
-- server's now() so a fast clock cannot make an old enrolment look newer than a
-- later leave, and a client-supplied unenrolled_at (the time the reader left,
-- recorded offline) is clamped the same way. A device whose clock runs slow by
-- more than the time between a leave and a re-join elsewhere can still have that
-- re-join treated as ended; phones on network time are well inside that margin.
--
-- Additive: one new table (with RLS), triggers, no change to existing rows.

CREATE TABLE IF NOT EXISTS public.user_reading_plan_unenrollments (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL,
  unenrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan_slug)
);

ALTER TABLE public.user_reading_plan_unenrollments ENABLE ROW LEVEL SECURITY;

-- Clients only ever read and upsert their own tombstones.
REVOKE ALL ON TABLE public.user_reading_plan_unenrollments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_reading_plan_unenrollments TO authenticated;
GRANT ALL ON TABLE public.user_reading_plan_unenrollments TO service_role;

DROP POLICY IF EXISTS plan_unenrollments_select_own ON public.user_reading_plan_unenrollments;
CREATE POLICY plan_unenrollments_select_own
  ON public.user_reading_plan_unenrollments FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS plan_unenrollments_insert_own ON public.user_reading_plan_unenrollments;
CREATE POLICY plan_unenrollments_insert_own
  ON public.user_reading_plan_unenrollments FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS plan_unenrollments_update_own ON public.user_reading_plan_unenrollments;
CREATE POLICY plan_unenrollments_update_own
  ON public.user_reading_plan_unenrollments FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- A tombstone never lies in the future and never moves back: a retried leave
-- recorded earlier cannot shorten a later one.
CREATE OR REPLACE FUNCTION public.normalize_reading_plan_unenrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.unenrolled_at := LEAST(COALESCE(NEW.unenrolled_at, now()), now());
  IF TG_OP = 'UPDATE' THEN
    NEW.unenrolled_at := GREATEST(NEW.unenrolled_at, OLD.unenrolled_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_reading_plan_unenrollment
  ON public.user_reading_plan_unenrollments;
CREATE TRIGGER normalize_reading_plan_unenrollment
  BEFORE INSERT OR UPDATE ON public.user_reading_plan_unenrollments
  FOR EACH ROW EXECUTE FUNCTION public.normalize_reading_plan_unenrollment();

-- Writing a tombstone ends the enrolment it covers.
CREATE OR REPLACE FUNCTION public.apply_reading_plan_unenrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.user_reading_plan_progress
  WHERE user_id = NEW.user_id
    AND plan_slug = NEW.plan_slug
    AND started_at <= NEW.unenrolled_at;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS apply_reading_plan_unenrollment
  ON public.user_reading_plan_unenrollments;
CREATE TRIGGER apply_reading_plan_unenrollment
  AFTER INSERT OR UPDATE ON public.user_reading_plan_unenrollments
  FOR EACH ROW EXECUTE FUNCTION public.apply_reading_plan_unenrollment();

-- A write for an enrolment that has ended is skipped, whoever sends it.
CREATE OR REPLACE FUNCTION public.skip_ended_reading_plan_progress()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.started_at := LEAST(NEW.started_at, now());
  IF NEW.plan_slug IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.user_reading_plan_unenrollments AS tombstone
    WHERE tombstone.user_id = NEW.user_id
      AND tombstone.plan_slug = NEW.plan_slug
      AND tombstone.unenrolled_at >= NEW.started_at
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS skip_ended_reading_plan_progress ON public.user_reading_plan_progress;
CREATE TRIGGER skip_ended_reading_plan_progress
  BEFORE INSERT OR UPDATE ON public.user_reading_plan_progress
  FOR EACH ROW EXECUTE FUNCTION public.skip_ended_reading_plan_progress();

-- An installed build's unenrol is a direct DELETE: record it as a tombstone.
-- Not leaves: deletes made by the tombstone trigger above (trigger depth > 1),
-- and rows cascaded from a deleted account, whose profile is already gone by the
-- time the cascade reaches this trigger (a tombstone for it would violate the
-- foreign key and abort the account deletion).
CREATE OR REPLACE FUNCTION public.record_reading_plan_unenrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF pg_trigger_depth() > 1
    OR OLD.plan_slug IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.user_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.user_reading_plan_unenrollments (user_id, plan_slug, unenrolled_at)
  VALUES (OLD.user_id, OLD.plan_slug, now())
  ON CONFLICT (user_id, plan_slug) DO UPDATE SET unenrolled_at = EXCLUDED.unenrolled_at;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS record_reading_plan_unenrollment ON public.user_reading_plan_progress;
CREATE TRIGGER record_reading_plan_unenrollment
  AFTER DELETE ON public.user_reading_plan_progress
  FOR EACH ROW EXECUTE FUNCTION public.record_reading_plan_unenrollment();
