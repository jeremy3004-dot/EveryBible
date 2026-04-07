-- Allow anonymous users to browse reading plans and plan entries.
-- The original policies were created with TO authenticated only, which
-- blocks unauthenticated users from seeing any available plans.

DROP POLICY IF EXISTS "plans_select_all" ON reading_plans;
CREATE POLICY "plans_select_all"
  ON reading_plans FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "plan_entries_select_all" ON reading_plan_entries;
CREATE POLICY "plan_entries_select_all"
  ON reading_plan_entries FOR SELECT
  TO anon, authenticated
  USING (true);
