import { assertEnv, type EnvMap } from './shared-contracts';

interface SiteServerEnv {
  serviceRoleKey: string;
  supabaseUrl: string;
}

function readEnv(): EnvMap {
  return process.env;
}

export function getSiteServerEnv(): SiteServerEnv {
  const env = readEnv();
  assertEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], env, 'Site server env');

  return {
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
  };
}
