import {
  adminPublicEnvKeys,
  adminServerEnvKeys,
  assertEnv,
  getMissingEnvKeys,
  type EnvMap,
} from './shared-contracts';

export interface AdminPublicEnv {
  adminUrl: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
}

export interface AdminServerEnv extends AdminPublicEnv {
  serviceRoleKey: string;
  upstreamApiBaseUrl: string;
  upstreamApiKey: string;
}

function readEnv(): EnvMap {
  return process.env;
}

const adminRequiredEnvKeys = [...adminPublicEnvKeys, ...adminServerEnvKeys] as const;

export function getAdminRequiredEnvKeys(): string[] {
  return getMissingEnvKeys(adminRequiredEnvKeys, readEnv());
}

export function isAdminConfigured(): boolean {
  return getAdminRequiredEnvKeys().length === 0;
}

export function getAdminPublicEnv(): AdminPublicEnv {
  const env = readEnv();
  assertEnv(adminPublicEnvKeys, env, 'Admin public env');

  return {
    adminUrl: env.NEXT_PUBLIC_ADMIN_URL!,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
  };
}

export function getAdminServerEnv(): AdminServerEnv {
  const env = readEnv();
  assertEnv([...adminPublicEnvKeys, ...adminServerEnvKeys], env, 'Admin server env');

  return {
    ...getAdminPublicEnv(),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    upstreamApiBaseUrl: env.EVERYBIBLE_UPSTREAM_API_BASE_URL!,
    upstreamApiKey: env.EVERYBIBLE_UPSTREAM_API_KEY!,
  };
}
