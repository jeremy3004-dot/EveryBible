export type EnvMap = Record<string, string | undefined>;

export const adminPublicEnvKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_ADMIN_URL',
] as const;

export const adminServerEnvKeys = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'EVERYBIBLE_UPSTREAM_API_BASE_URL',
  'EVERYBIBLE_UPSTREAM_API_KEY',
] as const;

export type AdminRole = 'super_admin';

export interface AdminNavigationItem {
  label: string;
  href: string;
  description: string;
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
