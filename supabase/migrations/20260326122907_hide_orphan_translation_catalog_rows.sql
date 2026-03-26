-- Hide catalog entries that claim text availability without any downloadable verse payload.
-- This cleans up Phase 21 placeholder rows and any Phase 28 import attempts that failed
-- after catalog metadata was written but before bible_verses finished importing.

UPDATE translation_catalog AS catalog
SET is_available = false
WHERE catalog.is_available = true
  AND catalog.has_text = true
  AND NOT EXISTS (
    SELECT 1
    FROM bible_verses AS verses
    WHERE verses.translation_id = catalog.translation_id
  );
