-- Allow mobile reading-plan progress to sync by local bundled slug instead of UUID only.

ALTER TABLE public.user_reading_plan_progress
  ADD COLUMN IF NOT EXISTS plan_slug TEXT;

UPDATE public.user_reading_plan_progress AS progress
SET plan_slug = plans.slug
FROM public.reading_plans AS plans
WHERE progress.plan_id = plans.id
  AND progress.plan_slug IS NULL;

ALTER TABLE public.user_reading_plan_progress
  ALTER COLUMN plan_id DROP NOT NULL;

ALTER TABLE public.user_reading_plan_progress
  DROP CONSTRAINT IF EXISTS user_reading_plan_progress_plan_ref_required;

ALTER TABLE public.user_reading_plan_progress
  ADD CONSTRAINT user_reading_plan_progress_plan_ref_required
  CHECK (plan_id IS NOT NULL OR plan_slug IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_reading_plan_progress_user_id_plan_slug_key'
  ) THEN
    ALTER TABLE public.user_reading_plan_progress
      ADD CONSTRAINT user_reading_plan_progress_user_id_plan_slug_key
      UNIQUE (user_id, plan_slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_plan_progress_plan_slug
  ON public.user_reading_plan_progress(plan_slug);
