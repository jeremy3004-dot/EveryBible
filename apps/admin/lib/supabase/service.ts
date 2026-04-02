import { createClient } from '@supabase/supabase-js';

import { getAdminServerEnv } from '@/lib/env';

export function createAdminServiceClient() {
  const env = getAdminServerEnv();

  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
