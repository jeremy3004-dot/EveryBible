import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getAdminPublicEnv } from '@/lib/env';
import { adminPublicEnvKeys, getMissingEnvKeys } from '@/lib/shared-contracts';

// /api/cron is called by Vercel Cron without a session and checks its own bearer secret.
const PUBLIC_PATHS = ['/login', '/api/cron'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function updateSession(request: NextRequest) {
  // An unconfigured deployment should reach the dashboard's setup card, not a 500 from here.
  if (getMissingEnvKeys(adminPublicEnvKeys, process.env).length > 0) {
    return NextResponse.next({ request });
  }

  const env = getAdminPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('reason', 'auth');
    return NextResponse.redirect(loginUrl);
  }

  // A session alone does not make someone an admin, so signed-in visitors are
  // not bounced off /login here: the dashboard sends non-admins to
  // /login?reason=forbidden, and bouncing them back to "/" looped forever. The
  // login page checks profiles.admin_role and forwards real admins itself.
  return response;
}
