-- Workflow and LangQuest service-role control plane.
-- RLS is enabled without anon/auth policies; server-side service-role paths own access.

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key TEXT NOT NULL CHECK (char_length(trim(workflow_key)) BETWEEN 1 AND 120),
  run_key TEXT NOT NULL CHECK (char_length(trim(run_key)) BETWEEN 1 AND 200),
  provider TEXT NOT NULL DEFAULT 'trigger.dev'
    CHECK (provider IN ('trigger.dev', 'graphile-worker', 'manual', 'supabase')),
  provider_run_id TEXT CHECK (provider_run_id IS NULL OR char_length(trim(provider_run_id)) BETWEEN 1 AND 240),
  trigger_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('manual', 'scheduled', 'retry', 'webhook', 'backfill')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'canceled', 'superseded')),
  related_entity_type TEXT CHECK (
    related_entity_type IS NULL
    OR related_entity_type IN ('langquest_candidate', 'langquest_translation', 'langquest_chapter', 'translation_catalog')
  ),
  related_entity_id TEXT CHECK (
    related_entity_id IS NULL
    OR char_length(trim(related_entity_id)) BETWEEN 1 AND 240
  ),
  idempotency_key TEXT CHECK (idempotency_key IS NULL OR char_length(trim(idempotency_key)) BETWEEN 1 AND 240),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1 AND max_attempts <= 25),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  failure_code TEXT CHECK (failure_code IS NULL OR char_length(trim(failure_code)) BETWEEN 1 AND 120),
  failure_message TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_runs_attempts_order CHECK (attempt <= max_attempts),
  CONSTRAINT workflow_runs_finished_after_started CHECK (
    finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at
  ),
  CONSTRAINT workflow_runs_payloads_are_objects CHECK (
    jsonb_typeof(input_payload) = 'object'
    AND jsonb_typeof(output_payload) = 'object'
    AND jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT workflow_runs_run_key_unique UNIQUE (workflow_key, run_key)
);

CREATE TABLE IF NOT EXISTS public.workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(trim(event_type)) BETWEEN 1 AND 120),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error')),
  message TEXT CHECK (message IS NULL OR char_length(trim(message)) BETWEEN 1 AND 4000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_events_payload_is_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT workflow_events_run_sequence_unique UNIQUE (run_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.langquest_translation_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  langquest_project_id TEXT NOT NULL CHECK (char_length(trim(langquest_project_id)) BETWEEN 1 AND 160),
  langquest_project_name TEXT NOT NULL CHECK (char_length(trim(langquest_project_name)) BETWEEN 1 AND 240),
  langquest_template TEXT CHECK (langquest_template IS NULL OR char_length(trim(langquest_template)) BETWEEN 1 AND 160),
  langquest_source_identity TEXT NOT NULL CHECK (char_length(trim(langquest_source_identity)) BETWEEN 1 AND 320),
  visibility TEXT NOT NULL DEFAULT 'unknown' CHECK (visibility IN ('unknown', 'private', 'published', 'unlisted')),
  language_code TEXT NOT NULL CHECK (char_length(trim(language_code)) BETWEEN 2 AND 32),
  language_name TEXT NOT NULL CHECK (char_length(trim(language_name)) BETWEEN 1 AND 160),
  territory_code TEXT CHECK (territory_code IS NULL OR char_length(trim(territory_code)) BETWEEN 2 AND 16),
  book_count INTEGER NOT NULL DEFAULT 0 CHECK (book_count >= 0 AND book_count <= 66),
  chapter_count INTEGER NOT NULL DEFAULT 0 CHECK (chapter_count >= 0 AND chapter_count <= 1189),
  source_updated_at TIMESTAMPTZ,
  last_discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovery_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ownership_state TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (ownership_state IN ('needs_review', 'ours', 'not_ours', 'blocked', 'archived')),
  ownership_state_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ownership_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT langquest_candidates_discovery_payload_is_object CHECK (jsonb_typeof(discovery_payload) = 'object'),
  CONSTRAINT langquest_candidates_identity_unique UNIQUE (langquest_source_identity)
);

CREATE TABLE IF NOT EXISTS public.langquest_ownership_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.langquest_translation_candidates(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('needs_review', 'ours', 'not_ours', 'blocked', 'archived')),
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 4000),
  source_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_decision_id UUID REFERENCES public.langquest_ownership_decisions(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT langquest_ownership_source_evidence_is_object CHECK (jsonb_typeof(source_evidence) = 'object')
);

CREATE TABLE IF NOT EXISTS public.langquest_selected_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.langquest_translation_candidates(id) ON DELETE RESTRICT,
  translation_id TEXT REFERENCES public.translation_catalog(translation_id) ON DELETE SET NULL,
  selection_state TEXT NOT NULL DEFAULT 'selected' CHECK (selection_state IN ('not_selected', 'selected', 'paused')),
  publish_state TEXT NOT NULL DEFAULT 'candidate'
    CHECK (publish_state IN ('candidate', 'ready', 'approved', 'published', 'archived', 'rolled_back')),
  r2_prefix TEXT CHECK (r2_prefix IS NULL OR char_length(trim(r2_prefix)) BETWEEN 1 AND 400),
  manifest_schema_version TEXT NOT NULL DEFAULT 'langquest-chapter-artifacts/v1'
    CHECK (char_length(trim(manifest_schema_version)) BETWEEN 1 AND 80),
  selected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  rollback_from_id UUID REFERENCES public.langquest_selected_translations(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT langquest_selected_candidate_unique UNIQUE (candidate_id),
  CONSTRAINT langquest_selected_paused_at_matches_state CHECK (
    selection_state = 'paused' OR paused_at IS NULL
  ),
  CONSTRAINT langquest_selected_approved_at_matches_state CHECK (
    publish_state NOT IN ('approved', 'published', 'rolled_back') OR approved_at IS NOT NULL
  ),
  CONSTRAINT langquest_selected_published_at_matches_state CHECK (
    publish_state <> 'published' OR published_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.langquest_chapter_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selected_translation_id UUID NOT NULL REFERENCES public.langquest_selected_translations(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  book_id TEXT NOT NULL CHECK (char_length(trim(book_id)) BETWEEN 1 AND 40),
  chapter INTEGER NOT NULL CHECK (chapter >= 1 AND chapter <= 150),
  artifact_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (artifact_state IN ('not_ready', 'pending', 'processing', 'ready', 'failed', 'superseded')),
  publish_state TEXT NOT NULL DEFAULT 'candidate'
    CHECK (publish_state IN ('candidate', 'ready', 'approved', 'published', 'archived', 'rolled_back')),
  source_checksum TEXT CHECK (source_checksum IS NULL OR char_length(trim(source_checksum)) BETWEEN 32 AND 128),
  source_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  manifest_r2_key TEXT CHECK (manifest_r2_key IS NULL OR char_length(trim(manifest_r2_key)) BETWEEN 1 AND 600),
  manifest_sha256 TEXT CHECK (manifest_sha256 IS NULL OR char_length(trim(manifest_sha256)) = 64),
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  segment_count INTEGER NOT NULL DEFAULT 0 CHECK (segment_count >= 0),
  failure_reason TEXT CHECK (failure_reason IS NULL OR char_length(trim(failure_reason)) BETWEEN 1 AND 4000),
  superseded_by_id UUID REFERENCES public.langquest_chapter_artifacts(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT langquest_chapter_artifacts_source_asset_ids_is_array CHECK (jsonb_typeof(source_asset_ids) = 'array'),
  CONSTRAINT langquest_chapter_artifacts_manifest_is_object CHECK (jsonb_typeof(manifest) = 'object'),
  CONSTRAINT langquest_chapter_artifacts_ready_has_manifest CHECK (
    artifact_state <> 'ready' OR manifest_r2_key IS NOT NULL
  ),
  CONSTRAINT langquest_chapter_artifacts_failed_has_reason CHECK (
    artifact_state <> 'failed' OR failure_reason IS NOT NULL
  ),
  CONSTRAINT langquest_chapter_artifacts_published_at_matches_state CHECK (
    publish_state <> 'published' OR published_at IS NOT NULL
  ),
  CONSTRAINT langquest_chapter_artifacts_chapter_unique UNIQUE (selected_translation_id, book_id, chapter, source_checksum)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_created_at
  ON public.workflow_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_related_entity
  ON public.workflow_runs (related_entity_type, related_entity_id)
  WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_provider_run_id
  ON public.workflow_runs (provider, provider_run_id)
  WHERE provider_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_events_run_created_at
  ON public.workflow_events (run_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_workflow_events_severity_created_at
  ON public.workflow_events (severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_langquest_candidates_ownership
  ON public.langquest_translation_candidates (ownership_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_langquest_candidates_language
  ON public.langquest_translation_candidates (language_code, language_name);

CREATE INDEX IF NOT EXISTS idx_langquest_candidates_project
  ON public.langquest_translation_candidates (langquest_project_id);

CREATE INDEX IF NOT EXISTS idx_langquest_ownership_candidate_decided_at
  ON public.langquest_ownership_decisions (candidate_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_langquest_selected_state
  ON public.langquest_selected_translations (selection_state, publish_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_langquest_selected_translation_id
  ON public.langquest_selected_translations (translation_id)
  WHERE translation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_langquest_chapter_artifacts_translation_state
  ON public.langquest_chapter_artifacts (selected_translation_id, artifact_state, publish_state);

CREATE INDEX IF NOT EXISTS idx_langquest_chapter_artifacts_lookup
  ON public.langquest_chapter_artifacts (selected_translation_id, book_id, chapter);

CREATE INDEX IF NOT EXISTS idx_langquest_chapter_artifacts_workflow_run
  ON public.langquest_chapter_artifacts (workflow_run_id)
  WHERE workflow_run_id IS NOT NULL;

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.langquest_translation_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.langquest_ownership_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.langquest_selected_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.langquest_chapter_artifacts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workflow_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.workflow_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.langquest_translation_candidates FROM anon, authenticated;
REVOKE ALL ON TABLE public.langquest_ownership_decisions FROM anon, authenticated;
REVOKE ALL ON TABLE public.langquest_selected_translations FROM anon, authenticated;
REVOKE ALL ON TABLE public.langquest_chapter_artifacts FROM anon, authenticated;

GRANT ALL ON TABLE public.workflow_runs TO service_role;
GRANT ALL ON TABLE public.workflow_events TO service_role;
GRANT ALL ON TABLE public.langquest_translation_candidates TO service_role;
GRANT ALL ON TABLE public.langquest_ownership_decisions TO service_role;
GRANT ALL ON TABLE public.langquest_selected_translations TO service_role;
GRANT ALL ON TABLE public.langquest_chapter_artifacts TO service_role;

DROP TRIGGER IF EXISTS update_workflow_runs_updated_at
  ON public.workflow_runs;
CREATE TRIGGER update_workflow_runs_updated_at
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_workflow_events_updated_at
  ON public.workflow_events;
CREATE TRIGGER update_workflow_events_updated_at
  BEFORE UPDATE ON public.workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_langquest_translation_candidates_updated_at
  ON public.langquest_translation_candidates;
CREATE TRIGGER update_langquest_translation_candidates_updated_at
  BEFORE UPDATE ON public.langquest_translation_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_langquest_ownership_decisions_updated_at
  ON public.langquest_ownership_decisions;
CREATE TRIGGER update_langquest_ownership_decisions_updated_at
  BEFORE UPDATE ON public.langquest_ownership_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_langquest_selected_translations_updated_at
  ON public.langquest_selected_translations;
CREATE TRIGGER update_langquest_selected_translations_updated_at
  BEFORE UPDATE ON public.langquest_selected_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_langquest_chapter_artifacts_updated_at
  ON public.langquest_chapter_artifacts;
CREATE TRIGGER update_langquest_chapter_artifacts_updated_at
  BEFORE UPDATE ON public.langquest_chapter_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
