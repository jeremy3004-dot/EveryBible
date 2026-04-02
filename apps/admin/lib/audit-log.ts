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

export async function writeAdminAuditLog({
  action,
  actorEmail,
  actorUserId,
  entityId,
  entityType,
  metadata,
  summary,
}: AuditLogInput): Promise<void> {
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
    console.error('Failed to write admin audit log', error);
  }
}
