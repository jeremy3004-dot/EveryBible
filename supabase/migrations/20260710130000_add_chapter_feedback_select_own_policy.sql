-- Phase 2 of the chapter-feedback revamp: let council members see the status of their
-- own submissions ("My feedback"). This is the first RLS policy on the table, which has
-- been deny-all (RLS enabled, zero policies) with all writes flowing through the
-- service-role edge functions. This policy grants SELECT of own rows only; INSERT /
-- UPDATE / DELETE remain denied, so submission and resolution stay server-mediated.

DROP POLICY IF EXISTS chapter_feedback_select_own ON public.chapter_feedback_submissions;

CREATE POLICY chapter_feedback_select_own
  ON public.chapter_feedback_submissions
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));
