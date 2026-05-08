import { createAdminServiceClient } from '@/lib/supabase/service';

export type LangQuestOwnershipState = 'needs_review' | 'ours' | 'not_ours' | 'blocked' | 'archived';
export type LangQuestSelectionState = 'not_selected' | 'selected' | 'paused';
export type LangQuestPublishState =
  | 'candidate'
  | 'ready'
  | 'approved'
  | 'published'
  | 'archived'
  | 'rolled_back';

export interface LangQuestCandidate {
  bookCount: number;
  chapterCount: number;
  id: string;
  languageCode: string;
  languageName: string;
  lastDiscoveredAt: string;
  projectId: string;
  projectName: string;
  sourceUpdatedAt: string | null;
  ownershipNotes: string | null;
  ownershipState: LangQuestOwnershipState;
  visibility: string;
}

export interface LangQuestSelectedTranslation {
  candidateId: string;
  id: string;
  notes: string | null;
  publishState: LangQuestPublishState;
  readyArtifactCount: number;
  selectionState: LangQuestSelectionState;
  totalArtifactCount: number;
  translationId: string | null;
  updatedAt: string;
}

export interface LangQuestChapterArtifact {
  artifactState: string;
  bookId: string;
  chapter: number;
  durationMs: number | null;
  failureReason: string | null;
  id: string;
  manifestR2Key: string | null;
  publishState: LangQuestPublishState;
  segmentCount: number;
  selectedTranslationId: string;
  updatedAt: string;
}

export interface WorkflowRunSummary {
  failureMessage: string | null;
  id: string;
  provider: string;
  providerRunId: string | null;
  relatedEntityId: string | null;
  status: string;
  triggerSource: string;
  workflowKey: string;
  createdAt: string;
}

export interface LangQuestDashboard {
  artifacts: LangQuestChapterArtifact[];
  candidates: LangQuestCandidate[];
  selectedTranslations: LangQuestSelectedTranslation[];
  workflowRuns: WorkflowRunSummary[];
}

export interface LangQuestDashboardFilters {
  ownership?: LangQuestOwnershipState | 'all';
  publish?: LangQuestPublishState | 'all';
  query?: string | null;
}

interface CandidateRow {
  book_count: number;
  chapter_count: number;
  id: string;
  language_code: string;
  language_name: string;
  last_discovered_at: string;
  langquest_project_id: string;
  langquest_project_name: string;
  ownership_notes: string | null;
  ownership_state: LangQuestOwnershipState;
  source_updated_at: string | null;
  visibility: string;
}

interface SelectedTranslationRow {
  candidate_id: string;
  id: string;
  notes: string | null;
  publish_state: LangQuestPublishState;
  selection_state: LangQuestSelectionState;
  translation_id: string | null;
  updated_at: string;
}

interface ArtifactRow {
  artifact_state: string;
  book_id: string;
  chapter: number;
  duration_ms: number | null;
  failure_reason: string | null;
  id: string;
  manifest_r2_key: string | null;
  publish_state: LangQuestPublishState;
  segment_count: number;
  selected_translation_id: string;
  updated_at: string;
}

interface WorkflowRunRow {
  created_at: string;
  failure_message: string | null;
  id: string;
  provider: string;
  provider_run_id: string | null;
  related_entity_id: string | null;
  status: string;
  trigger_source: string;
  workflow_key: string;
}

export async function getLangQuestDashboard(
  filters: LangQuestDashboardFilters = {}
): Promise<LangQuestDashboard> {
  const service = createAdminServiceClient();
  const [candidates, selectedTranslations, artifacts, workflowRuns] = await Promise.all([
    service
      .from('langquest_translation_candidates')
      .select(
        'id, langquest_project_id, langquest_project_name, visibility, language_code, language_name, book_count, chapter_count, source_updated_at, last_discovered_at, ownership_state, ownership_notes'
      )
      .order('updated_at', { ascending: false })
      .limit(100),
    service
      .from('langquest_selected_translations')
      .select('id, candidate_id, translation_id, selection_state, publish_state, notes, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100),
    service
      .from('langquest_chapter_artifacts')
      .select(
        'id, selected_translation_id, book_id, chapter, artifact_state, publish_state, manifest_r2_key, duration_ms, segment_count, failure_reason, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(50),
    service
      .from('workflow_runs')
      .select(
        'id, workflow_key, provider, provider_run_id, trigger_source, status, related_entity_id, failure_message, created_at'
      )
      .in('workflow_key', ['langquest-selected-ingest', 'langquest-discover-candidates'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (candidates.error) {
    throw new Error(`Unable to load LangQuest candidates: ${candidates.error.message}`);
  }

  if (selectedTranslations.error) {
    throw new Error(
      `Unable to load selected LangQuest translations: ${selectedTranslations.error.message}`
    );
  }

  if (artifacts.error) {
    throw new Error(`Unable to load LangQuest artifacts: ${artifacts.error.message}`);
  }

  if (workflowRuns.error) {
    throw new Error(`Unable to load LangQuest workflow runs: ${workflowRuns.error.message}`);
  }

  const candidateItems = ((candidates.data ?? []) as CandidateRow[]).map((row) => ({
    bookCount: row.book_count,
    chapterCount: row.chapter_count,
    id: row.id,
    languageCode: row.language_code,
    languageName: row.language_name,
    lastDiscoveredAt: row.last_discovered_at,
    ownershipNotes: row.ownership_notes,
    ownershipState: row.ownership_state,
    projectId: row.langquest_project_id,
    projectName: row.langquest_project_name,
    sourceUpdatedAt: row.source_updated_at,
    visibility: row.visibility,
  }));
  const artifactItems = ((artifacts.data ?? []) as ArtifactRow[]).map((row) => ({
    artifactState: row.artifact_state,
    bookId: row.book_id,
    chapter: row.chapter,
    durationMs: row.duration_ms,
    failureReason: row.failure_reason,
    id: row.id,
    manifestR2Key: row.manifest_r2_key,
    publishState: row.publish_state,
    segmentCount: row.segment_count,
    selectedTranslationId: row.selected_translation_id,
    updatedAt: row.updated_at,
  }));
  const artifactsBySelected = new Map<string, LangQuestChapterArtifact[]>();
  for (const artifact of artifactItems) {
    const selectedArtifacts = artifactsBySelected.get(artifact.selectedTranslationId) ?? [];
    selectedArtifacts.push(artifact);
    artifactsBySelected.set(artifact.selectedTranslationId, selectedArtifacts);
  }

  const selectedItems = ((selectedTranslations.data ?? []) as SelectedTranslationRow[]).map(
    (row) => {
      const selectedArtifacts = artifactsBySelected.get(row.id) ?? [];

      return {
        candidateId: row.candidate_id,
        id: row.id,
        notes: row.notes,
        publishState: row.publish_state,
        readyArtifactCount: selectedArtifacts.filter(
          (artifact) => artifact.artifactState === 'ready'
        ).length,
        selectionState: row.selection_state,
        totalArtifactCount: selectedArtifacts.length,
        translationId: row.translation_id,
        updatedAt: row.updated_at,
      };
    }
  );
  const candidateById = new Map(candidateItems.map((candidate) => [candidate.id, candidate]));
  const normalizedQuery = filters.query?.trim().toLowerCase() ?? '';
  const ownershipFilter = filters.ownership && filters.ownership !== 'all' ? filters.ownership : null;
  const publishFilter = filters.publish && filters.publish !== 'all' ? filters.publish : null;

  const matchesQuery = (candidate: LangQuestCandidate): boolean => {
    if (!normalizedQuery) {
      return true;
    }

    return [
      candidate.id,
      candidate.languageCode,
      candidate.languageName,
      candidate.projectId,
      candidate.projectName,
      candidate.visibility,
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
  };

  const filteredCandidates = candidateItems.filter(
    (candidate) =>
      matchesQuery(candidate) && (!ownershipFilter || candidate.ownershipState === ownershipFilter)
  );
  const filteredCandidateIds = new Set(filteredCandidates.map((candidate) => candidate.id));
  const filteredSelected = selectedItems.filter((selected) => {
    const candidate = candidateById.get(selected.candidateId);
    const selectedMatchesQuery =
      !normalizedQuery ||
      [selected.id, selected.translationId ?? '', selected.notes ?? ''].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      );

    return (
      (!publishFilter || selected.publishState === publishFilter) &&
      (filteredCandidateIds.has(selected.candidateId) || selectedMatchesQuery || !candidate)
    );
  });
  const filteredSelectedIds = new Set(filteredSelected.map((selected) => selected.id));

  return {
    candidates: filteredCandidates,
    selectedTranslations: filteredSelected,
    artifacts: artifactItems.filter((artifact) =>
      filteredSelectedIds.has(artifact.selectedTranslationId)
    ),
    workflowRuns: ((workflowRuns.data ?? []) as WorkflowRunRow[]).map((row) => ({
      createdAt: row.created_at,
      failureMessage: row.failure_message,
      id: row.id,
      provider: row.provider,
      providerRunId: row.provider_run_id,
      relatedEntityId: row.related_entity_id,
      status: row.status,
      triggerSource: row.trigger_source,
      workflowKey: row.workflow_key,
    })),
  };
}
