import type {
  ContentImageKind,
  HomepageContentOverridePayload,
  MobileContentOverridePayload,
  OperatorAuditMetadata,
} from '@everybible/types';

export type EnvMap = Record<string, string | undefined>;
export type {
  ContentImageKind,
  HomepageContentOverridePayload,
  MobileContentOverridePayload,
  OperatorAuditMetadata,
};

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
