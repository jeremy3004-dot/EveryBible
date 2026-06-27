import type { OperatorAuditMetadata } from './operator-audit-metadata';

import { createAdminServiceClient } from '@/lib/supabase/service';

interface AuditLogInput {
  action: string;
  actorEmail: string;
  actorUserId: string;
  entityId?: string | null;
  entityType: string;
  metadata?: Record<string, unknown> | OperatorAuditMetadata;
  summary: string;
}

function normalizeAuditMetadata(
  metadata?: Record<string, unknown> | OperatorAuditMetadata
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  const normalized = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );

  if (Array.isArray(normalized.changedFields)) {
    normalized.changedFields = normalized.changedFields.filter(
      (field): field is string => typeof field === 'string'
    );
  }

  return normalized;
}

export interface AuditLogResult {
  error: string | null;
  ok: boolean;
}

/**
 * Records an admin mutation in `admin_audit_logs`.
 *
 * A failed audit write is intentionally non-fatal: the data mutation it wraps
 * has already committed, so throwing here would surface a misleading error to
 * the operator and could trigger a duplicate retry. Instead of swallowing the
 * failure, we escalate it with full context and return a structured result so
 * callers (and log monitors) can detect an unrecorded action.
 */
export async function writeAdminAuditLog({
  action,
  actorEmail,
  actorUserId,
  entityId,
  entityType,
  metadata,
  summary,
}: AuditLogInput): Promise<AuditLogResult> {
  const service = createAdminServiceClient();
  const { error } = await service.from('admin_audit_logs').insert({
    action,
    actor_email: actorEmail,
    actor_user_id: actorUserId,
    entity_id: entityId ?? null,
    entity_type: entityType,
    metadata: normalizeAuditMetadata(metadata),
    summary,
  });

  if (error) {
    console.error('[admin-audit] FAILED to record admin action — mutation is now untracked', {
      action,
      actorEmail,
      actorUserId,
      entityId: entityId ?? null,
      entityType,
      error: error.message,
    });
    return { error: error.message, ok: false };
  }

  return { error: null, ok: true };
}
