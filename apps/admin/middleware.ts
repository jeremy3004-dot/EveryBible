import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

// Next 15 loads this file only as `middleware.ts` exporting `middleware` (Next 16 renames the
// convention to `proxy.ts` / `proxy`). It refreshes the Supabase session cookies, which Server
// Components cannot write, and sends signed-out visitors to /login. Admin role checks stay in
// the dashboard layout, pages, actions and route handlers.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|maplibre/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
