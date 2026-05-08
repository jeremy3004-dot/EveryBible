import { tasks } from '@trigger.dev/sdk';

import { createAdminServiceClient } from '@/lib/supabase/service';

export const LANGQUEST_SELECTED_INGEST_TASK_ID = 'langquest-selected-ingest';
export const LANGQUEST_DISCOVERY_TASK_ID = 'langquest-discover-candidates';

interface EnqueueLangQuestWorkflowOptions {
  relatedEntityId?: string | null;
  taskId: typeof LANGQUEST_SELECTED_INGEST_TASK_ID | typeof LANGQUEST_DISCOVERY_TASK_ID;
  payload: Record<string, unknown>;
  startedBy: string;
}

interface WorkflowRunRecord {
  id: string;
}

interface TriggerHandle {
  id?: string;
}

function buildRunKey(taskId: string, scopeId?: string | null): string {
  const scope = scopeId ?? 'all';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${taskId}:${scope}:${timestamp}`;
}

async function enqueueLangQuestWorkflow({
  payload,
  relatedEntityId,
  taskId,
  startedBy,
}: EnqueueLangQuestWorkflowOptions): Promise<{
  providerRunId: string | null;
  triggerConfigured: boolean;
  workflowRunId: string;
}> {
  const service = createAdminServiceClient();
  const runKey = buildRunKey(taskId, relatedEntityId);

  const { data, error } = await service
    .from('workflow_runs')
    .insert({
      workflow_key: taskId,
      run_key: runKey,
      provider: 'trigger.dev',
      trigger_source: 'manual',
      status: 'queued',
      related_entity_type: relatedEntityId ? 'langquest_translation' : null,
      related_entity_id: relatedEntityId ?? null,
      idempotency_key: runKey,
      input_payload: payload,
      max_attempts: 3,
      created_by: startedBy,
      metadata: {
        triggerConfigured: Boolean(process.env.TRIGGER_SECRET_KEY),
      },
    })
    .select('id')
    .single<WorkflowRunRecord>();

  if (error || !data) {
    throw new Error(`Unable to create LangQuest workflow run: ${error?.message ?? 'no run id'}`);
  }

  if (!process.env.TRIGGER_SECRET_KEY) {
    await service.from('workflow_events').insert({
      run_id: data.id,
      event_type: 'trigger.skipped',
      severity: 'warning',
      message: 'TRIGGER_SECRET_KEY is not configured; run record was created for operator visibility.',
      sequence: 1,
    });

    return {
      providerRunId: null,
      triggerConfigured: false,
      workflowRunId: data.id,
    };
  }

  try {
    const handle = (await tasks.trigger(
      taskId,
      {
        ...payload,
        workflowRunId: data.id,
      },
      {
        idempotencyKey: runKey,
      }
    )) as TriggerHandle;

    const providerRunId = handle.id ?? null;
    await service
      .from('workflow_runs')
      .update({
        provider_run_id: providerRunId,
        metadata: {
          triggerConfigured: true,
        },
      })
      .eq('id', data.id);

    await service.from('workflow_events').insert({
      run_id: data.id,
      event_type: 'trigger.enqueued',
      severity: 'info',
      message: providerRunId
        ? `Trigger.dev run ${providerRunId} was enqueued.`
        : 'Trigger.dev accepted the run but did not return a run id.',
      payload: {
        providerRunId,
      },
      sequence: 1,
    });

    return {
      providerRunId,
      triggerConfigured: true,
      workflowRunId: data.id,
    };
  } catch (triggerError) {
    const message =
      triggerError instanceof Error ? triggerError.message : 'Unknown Trigger.dev enqueue error';

    await service
      .from('workflow_runs')
      .update({
        failure_message: message,
        status: 'failed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    await service.from('workflow_events').insert({
      run_id: data.id,
      event_type: 'trigger.enqueue_failed',
      severity: 'error',
      message,
      sequence: 1,
    });

    throw new Error(`Unable to enqueue Trigger.dev LangQuest ingest: ${message}`);
  }
}

export async function enqueueLangQuestDiscovery(startedBy: string) {
  return enqueueLangQuestWorkflow({
    payload: {
      source: 'manual',
    },
    taskId: LANGQUEST_DISCOVERY_TASK_ID,
    startedBy,
  });
}

export async function enqueueLangQuestSelectedIngest({
  selectedTranslationId,
  startedBy,
}: {
  selectedTranslationId?: string | null;
  startedBy: string;
}) {
  return enqueueLangQuestWorkflow({
    payload: {
      selectedTranslationId: selectedTranslationId ?? null,
      source: 'manual',
    },
    relatedEntityId: selectedTranslationId,
    taskId: LANGQUEST_SELECTED_INGEST_TASK_ID,
    startedBy,
  });
}
