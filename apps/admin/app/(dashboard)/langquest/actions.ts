'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdminIdentity } from '@/lib/admin-auth';
import { writeAdminAuditLog } from '@/lib/audit-log';
import { normalizeOptionalString } from '@/lib/format';
import { enqueueLangQuestDiscovery, enqueueLangQuestSelectedIngest } from '@/lib/langquest/workflows';
import { createAdminServiceClient } from '@/lib/supabase/service';
import type { LangQuestOwnershipState, LangQuestPublishState } from '@/lib/langquest/admin-data';

const ownershipStates = new Set<LangQuestOwnershipState>([
  'needs_review',
  'ours',
  'not_ours',
  'blocked',
  'archived',
]);

const publishTransitionTargets = new Set<LangQuestPublishState>([
  'ready',
  'approved',
  'published',
  'archived',
  'rolled_back',
]);

const allowedPublishTransitions: Record<LangQuestPublishState, LangQuestPublishState[]> = {
  approved: ['published', 'archived'],
  archived: [],
  candidate: ['ready', 'archived'],
  published: ['rolled_back', 'archived'],
  ready: ['approved', 'archived'],
  rolled_back: ['approved', 'archived'],
};

interface SelectedPublishRow {
  id: string;
  manifest_schema_version: string;
  publish_state: LangQuestPublishState;
  r2_prefix: string | null;
  selection_state: string;
  translation_id: string | null;
}

function canTransitionPublishState(
  currentState: LangQuestPublishState,
  targetState: LangQuestPublishState
): boolean {
  return (
    currentState === targetState || allowedPublishTransitions[currentState].includes(targetState)
  );
}

export async function updateLangQuestOwnershipAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const candidateId = normalizeOptionalString(formData.get('candidateId'));
  const ownershipState = normalizeOptionalString(formData.get('ownershipState'));
  const reason = normalizeOptionalString(formData.get('reason'));

  if (
    !candidateId ||
    !ownershipState ||
    !ownershipStates.has(ownershipState as LangQuestOwnershipState) ||
    !reason
  ) {
    redirect('/langquest?error=Candidate, ownership state, and reason are required');
  }

  const service = createAdminServiceClient();
  const { error: updateError } = await service
    .from('langquest_translation_candidates')
    .update({
      ownership_notes: reason,
      ownership_state: ownershipState,
      ownership_state_updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);

  if (updateError) {
    redirect(`/langquest?error=${encodeURIComponent(updateError.message)}`);
  }

  const { error: decisionError } = await service.from('langquest_ownership_decisions').insert({
    candidate_id: candidateId,
    decided_by: admin.id,
    decision: ownershipState,
    reason,
    source_evidence: {},
  });

  if (decisionError) {
    redirect(`/langquest?error=${encodeURIComponent(decisionError.message)}`);
  }

  await writeAdminAuditLog({
    action: 'langquest.ownership.update',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: candidateId,
    entityType: 'langquest_candidate',
    metadata: {
      ownershipState,
    },
    summary: `Marked LangQuest candidate ${candidateId} as ${ownershipState}.`,
  });

  revalidatePath('/langquest');
  redirect('/langquest?notice=Ownership decision saved');
}

export async function selectLangQuestTranslationAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const candidateId = normalizeOptionalString(formData.get('candidateId'));
  const translationId = normalizeOptionalString(formData.get('translationId'));
  const notes = normalizeOptionalString(formData.get('notes'));

  if (!candidateId) {
    redirect('/langquest?error=Missing candidate id');
  }

  const service = createAdminServiceClient();
  const { data: candidate, error: candidateError } = await service
    .from('langquest_translation_candidates')
    .select('id, ownership_state')
    .eq('id', candidateId)
    .maybeSingle<{ id: string; ownership_state: string }>();

  if (candidateError || !candidate) {
    redirect(
      `/langquest?error=${encodeURIComponent(candidateError?.message ?? 'Candidate not found')}`
    );
  }

  if (candidate.ownership_state !== 'ours') {
    redirect('/langquest?error=Only candidates marked ours can be selected for ingestion');
  }

  const { data, error } = await service
    .from('langquest_selected_translations')
    .upsert(
      {
        candidate_id: candidateId,
        notes,
        selected_by: admin.id,
        selection_state: 'selected',
        translation_id: translationId,
      },
      { onConflict: 'candidate_id' }
    )
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    redirect(`/langquest?error=${encodeURIComponent(error?.message ?? 'Selection failed')}`);
  }

  await writeAdminAuditLog({
    action: 'langquest.translation.select',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: data.id,
    entityType: 'langquest_translation',
    metadata: {
      candidateId,
      translationId,
    },
    summary: `Selected LangQuest candidate ${candidateId} for recurring ingestion.`,
  });

  revalidatePath('/langquest');
  redirect('/langquest?notice=Translation selected for ingestion');
}

export async function updateLangQuestPublishStateAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const selectedTranslationId = normalizeOptionalString(formData.get('selectedTranslationId'));
  const targetState = normalizeOptionalString(formData.get('publishState'));
  const reason = normalizeOptionalString(formData.get('reason'));

  if (
    !selectedTranslationId ||
    !targetState ||
    !publishTransitionTargets.has(targetState as LangQuestPublishState) ||
    !reason
  ) {
    redirect('/langquest?error=Selected translation, publish state, and reason are required');
  }

  const publishState = targetState as LangQuestPublishState;
  const service = createAdminServiceClient();
  const { data: selected, error: selectedError } = await service
    .from('langquest_selected_translations')
    .select('id, manifest_schema_version, publish_state, r2_prefix, selection_state, translation_id')
    .eq('id', selectedTranslationId)
    .maybeSingle<SelectedPublishRow>();

  if (selectedError || !selected) {
    redirect(
      `/langquest?error=${encodeURIComponent(selectedError?.message ?? 'Selected translation not found')}`
    );
  }

  if (!canTransitionPublishState(selected.publish_state, publishState)) {
    redirect(
      `/langquest?error=${encodeURIComponent(
        `Cannot transition LangQuest publish state from ${selected.publish_state} to ${publishState}`
      )}`
    );
  }

  const { count: readyArtifactCount, error: readyArtifactError } = await service
    .from('langquest_chapter_artifacts')
    .select('id', { count: 'exact', head: true })
    .eq('selected_translation_id', selectedTranslationId)
    .eq('artifact_state', 'ready');

  if (readyArtifactError) {
    redirect(`/langquest?error=${encodeURIComponent(readyArtifactError.message)}`);
  }

  if (
    (publishState === 'ready' || publishState === 'approved' || publishState === 'published') &&
    (readyArtifactCount ?? 0) === 0
  ) {
    redirect('/langquest?error=Ready chapter artifacts are required before approval or publishing');
  }

  if (
    publishState === 'published' &&
    (!selected.r2_prefix ||
      selected.manifest_schema_version !== 'everybible-audio-segment-manifest/v1')
  ) {
    redirect(
      '/langquest?error=Promotion manifest is required before marking a LangQuest translation published'
    );
  }

  const now = new Date().toISOString();
  const selectedUpdate: {
    approved_at?: string;
    approved_by?: string;
    publish_state: LangQuestPublishState;
    published_at?: string;
  } = {
    publish_state: publishState,
  };

  if (publishState === 'approved' || publishState === 'published') {
    selectedUpdate.approved_at = now;
    selectedUpdate.approved_by = admin.id;
  }

  if (publishState === 'published') {
    selectedUpdate.published_at = now;
  }

  const { error: updateError } = await service
    .from('langquest_selected_translations')
    .update(selectedUpdate)
    .eq('id', selectedTranslationId);

  if (updateError) {
    redirect(`/langquest?error=${encodeURIComponent(updateError.message)}`);
  }

  const artifactUpdate: {
    publish_state: LangQuestPublishState;
    published_at?: string;
  } = {
    publish_state: publishState,
  };

  if (publishState === 'published') {
    artifactUpdate.published_at = now;
  }

  const artifactQuery = service
    .from('langquest_chapter_artifacts')
    .update(artifactUpdate)
    .eq('selected_translation_id', selectedTranslationId);

  if (publishState === 'ready' || publishState === 'approved' || publishState === 'published') {
    artifactQuery.eq('artifact_state', 'ready');
  }

  const { error: artifactUpdateError } = await artifactQuery;

  if (artifactUpdateError) {
    redirect(`/langquest?error=${encodeURIComponent(artifactUpdateError.message)}`);
  }

  await writeAdminAuditLog({
    action: 'langquest.publish_state.update',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: selectedTranslationId,
    entityType: 'langquest_translation',
    metadata: {
      fromPublishState: selected.publish_state,
      reason,
      readyArtifactCount,
      toPublishState: publishState,
      translationId: selected.translation_id,
    },
    summary: `Moved LangQuest translation ${selectedTranslationId} from ${selected.publish_state} to ${publishState}.`,
  });

  revalidatePath('/langquest');
  redirect(`/langquest?notice=${encodeURIComponent(`Publish state moved to ${publishState}`)}`);
}

export async function runLangQuestSelectedIngestAction(formData: FormData) {
  const admin = await requireAdminIdentity();
  const selectedTranslationId = normalizeOptionalString(formData.get('selectedTranslationId'));

  const result = await enqueueLangQuestSelectedIngest({
    selectedTranslationId,
    startedBy: admin.id,
  });

  await writeAdminAuditLog({
    action: 'langquest.ingest.enqueue',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: result.workflowRunId,
    entityType: 'workflow_run',
    metadata: {
      providerRunId: result.providerRunId,
      selectedTranslationId,
      triggerConfigured: result.triggerConfigured,
    },
    summary: result.triggerConfigured
      ? 'Enqueued LangQuest selected-translation ingest in Trigger.dev.'
      : 'Created LangQuest ingest run record; Trigger.dev is not configured in this environment.',
  });

  revalidatePath('/langquest');
  redirect(
    result.triggerConfigured
      ? '/langquest?notice=LangQuest ingest enqueued'
      : '/langquest?notice=Run record created; configure Trigger.dev to execute it'
  );
}

export async function runLangQuestDiscoveryAction() {
  const admin = await requireAdminIdentity();
  const result = await enqueueLangQuestDiscovery(admin.id);

  await writeAdminAuditLog({
    action: 'langquest.discovery.enqueue',
    actorEmail: admin.email,
    actorUserId: admin.id,
    entityId: result.workflowRunId,
    entityType: 'workflow_run',
    metadata: {
      providerRunId: result.providerRunId,
      triggerConfigured: result.triggerConfigured,
    },
    summary: result.triggerConfigured
      ? 'Enqueued LangQuest candidate discovery in Trigger.dev.'
      : 'Created LangQuest discovery run record; Trigger.dev is not configured in this environment.',
  });

  revalidatePath('/langquest');
  redirect(
    result.triggerConfigured
      ? '/langquest?notice=LangQuest discovery enqueued'
      : '/langquest?notice=Discovery run record created; configure Trigger.dev to execute it'
  );
}
