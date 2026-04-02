import { createAdminServiceClient } from '@/lib/supabase/service';

interface AuditLogInput {
  action: string;
  actorEmail: string;
  actorUserId: string;
  entityId?: string | null;
  entityType: string;
  metadata?: Record<string, unknown>;
  summary: string;
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
    metadata: metadata ?? {},
    summary,
  });

  if (error) {
    console.error('Failed to write admin audit log', error);
  }
}
