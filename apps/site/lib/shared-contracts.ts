export type EnvMap = Record<string, string | undefined>;

export type ContentImageKind = 'hero' | 'verse_of_day' | 'promo' | 'feature' | 'social';

export interface MobileContentOverridePayload {
  generatedAt: string;
  verseOfDay: {
    id: string;
    title: string | null;
    verseText: string;
    referenceLabel: string;
    translationId: string;
    imageUrl: string | null;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
  images: Array<{
    id: string;
    title: string;
    kind: ContentImageKind;
    imageUrl: string;
    altText: string;
    startsAt: string | null;
    endsAt: string | null;
  }>;
}

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

export function getMissingEnvKeys(keys: readonly string[], env: EnvMap): string[] {
  return keys.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

export function assertEnv(keys: readonly string[], env: EnvMap, scope: string): void {
  const missingKeys = getMissingEnvKeys(keys, env);
  if (missingKeys.length === 0) {
    return;
  }

  throw new Error(`${scope} is missing required environment variables: ${missingKeys.join(', ')}`);
}
