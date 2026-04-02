import { createClient } from '@supabase/supabase-js';

import { getSiteServerEnv } from '../env';

export function createSiteServiceClient() {
  const env = getSiteServerEnv();

  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
