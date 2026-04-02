export interface OperatorAuditMetadata {
  actorSource?: string;
  channel?: string | null;
  toolName?: string | null;
  targetSlug?: string | null;
  changedFields?: string[];
  requesterSenderId?: string | null;
  requesterDisplayName?: string | null;
  requestId?: string | null;
  [key: string]: unknown;
}
