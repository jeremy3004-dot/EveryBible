-- P2 S13: align geo_accuracy_km to a single INTEGER contract.
--
-- Repo drift: 20260402193000 added geo_accuracy_km DOUBLE PRECISION, then
-- 20260403132529's `ADD COLUMN IF NOT EXISTS ... INTEGER` was a no-op (column
-- already existed) while batch_track_events casts the value ::integer. Live is
-- already INTEGER, but a fresh env from the repo would get a DOUBLE PRECISION
-- column fed by an integer-casting function.
--
-- This makes the column definitively INTEGER everywhere so it matches the
-- function cast AND the edge-function accuracy defaults (country-only ~800 km,
-- city ~50 km, shipped in P1 S5b). Coarse integer km is intentional: the privacy
-- plan buckets coordinates and never stores exact GPS, so sub-kilometre
-- precision is neither needed nor desirable. No-op on the live DB (already
-- integer); on a fresh env it rounds any double values to integer.
ALTER TABLE public.analytics_events
  ALTER COLUMN geo_accuracy_km TYPE integer
  USING CASE
    WHEN geo_accuracy_km IS NULL THEN NULL
    ELSE round(geo_accuracy_km)::integer
  END;
