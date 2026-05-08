import { createClient } from '@supabase/supabase-js';

import { getWorkflowEnv } from './env';

export function createWorkflowServiceClient() {
  const env = getWorkflowEnv();

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
