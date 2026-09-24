import type { NextRequest } from 'next/server';

import {
  buildAdminContentSecurityPolicy,
  createCspNonce,
  CSP_NONCE_HEADER,
} from '@/lib/content-security-policy';
import { updateSession } from '@/lib/supabase/proxy';

// Next 15 loads this file only as `middleware.ts` exporting `middleware` (Next 16 renames the
// convention to `proxy.ts` / `proxy`). It refreshes the Supabase session cookies, which Server
// Components cannot write, and sends signed-out visitors to /login. Admin role checks stay in
// the dashboard layout, pages, actions and route handlers.
//
// It also issues the per-request CSP nonce. Next.js reads the nonce back from the request's
// Content-Security-Policy header and stamps it on its own scripts; the root layout reads
// x-nonce for the theme bootstrap <Script>.
export async function middleware(request: NextRequest) {
  const nonce = createCspNonce();
  const csp = buildAdminContentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV !== 'production',
  });
  request.headers.set(CSP_NONCE_HEADER, nonce);
  request.headers.set('content-security-policy', csp);

  const response = await updateSession(request);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|maplibre/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
