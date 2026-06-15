import { createClient } from '@supabase/supabase-js';

import { getAdminServerEnv } from '@/lib/env';

export function createAdminServiceClient() {
  const env = getAdminServerEnv();

  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Prevent Next.js from caching Supabase fetches at the framework layer.
      // Without this the analytics page can serve stale build-time data on Vercel.
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}
