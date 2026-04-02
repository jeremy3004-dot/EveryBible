import { createBrowserClient } from '@supabase/ssr';

import { getAdminPublicEnv } from '@/lib/env';

export function createAdminBrowserClient() {
  const env = getAdminPublicEnv();

  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
