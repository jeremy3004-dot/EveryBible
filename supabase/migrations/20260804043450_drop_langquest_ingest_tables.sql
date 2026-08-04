-- Drop the retired LangQuest ingest control plane.
--
-- The in-repo LangQuest ingest pipeline (Trigger.dev workflows app + admin
-- surface + these tables) never received production credentials and is
-- superseded by Every Language's own distribution, integrated in the app as
-- src/services/elMedia/. See docs/plans/2026-08-03-el-media-integration.md
-- (Part E). All six tables were verified empty (0 rows) in the live project
-- on 2026-08-04 before this drop, and no non-langquest consumer references
-- workflow_runs / workflow_events.
--
-- This mirror-inverts 20260508090000_create_workflow_langquest_tables.sql.
-- Tables are dropped children-first in FK dependency order. Per-table triggers
-- and indexes are removed implicitly with their tables. The shared
-- public.update_updated_at() function is used by many other tables and is
-- intentionally NOT dropped.

DROP TABLE IF EXISTS public.langquest_chapter_artifacts;
DROP TABLE IF EXISTS public.langquest_ownership_decisions;
DROP TABLE IF EXISTS public.langquest_selected_translations;
DROP TABLE IF EXISTS public.langquest_translation_candidates;
DROP TABLE IF EXISTS public.workflow_events;
DROP TABLE IF EXISTS public.workflow_runs;
