import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getAdminPublicEnv } from '@/lib/env';

export async function createAdminServerClient() {
  const env = getAdminPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignored in Server Components; the proxy handles cookie refresh.
        }
      },
    },
  });
}
