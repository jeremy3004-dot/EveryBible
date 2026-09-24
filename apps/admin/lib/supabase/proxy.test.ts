/**
 * The request proxy only knows whether a Supabase session exists (JWT claims);
 * profiles.admin_role is checked later by the dashboard layout, pages, actions
 * and route handlers. These tests pin how the two layers hand off.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import { mockModule } from '../testing/adminTestHarness';

let claims: Record<string, unknown> | null = null;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
process.env.NEXT_PUBLIC_ADMIN_URL = 'https://admin.example';

mockModule(mock, '@supabase/ssr', {
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: null }) },
  }),
});

const { NextRequest } = await import('next/server');
const { updateSession } = await import('./proxy');

beforeEach(() => {
  claims = null;
});

async function visit(url: string) {
  const response = await updateSession(new NextRequest(`https://admin.example${url}`));
  const location = response.headers.get('location');
  return location ? { redirect: location.replace('https://admin.example', '') } : { next: true };
}

test('a visitor without a session is sent to login from any admin page', async () => {
  for (const path of ['/', '/analytics', '/support/users/u1', '/api/operator/chat']) {
    assert.deepEqual(await visit(path), { redirect: '/login?reason=auth' }, path);
  }
});

test('the login page is reachable without a session', async () => {
  assert.deepEqual(await visit('/login'), { next: true });
  assert.deepEqual(await visit('/login?reason=auth'), { next: true });
});

test('a signed-in visitor reaches admin pages, where admin_role is then enforced', async () => {
  claims = { sub: 'user-7' };
  assert.deepEqual(await visit('/analytics'), { next: true });
});

test('a signed-in non-admin sent to login as forbidden stays there instead of looping back to the dashboard', async () => {
  // The dashboard layout redirects a non-admin to /login?reason=forbidden.
  // If the proxy bounced every signed-in visitor off /login back to "/", the
  // browser would loop "/" → "/login?reason=forbidden" → "/" until it gave up,
  // and the user could never see why or sign out. The login page itself sends
  // real admins on to the dashboard after checking admin_role.
  claims = { sub: 'user-7' };
  assert.deepEqual(await visit('/login?reason=forbidden'), { next: true });
});

test('the session proxy is installed under the file name this Next.js version loads', async () => {
  // Next 15 only runs `middleware.ts` (Next 16 renamed it to `proxy.ts`). A root `proxy.ts` on
  // Next 15 is silently ignored: no session refresh, no signed-out redirect, and Server
  // Components cannot write the refreshed Supabase cookies themselves.
  const { MIDDLEWARE_FILENAME } = (await import('next/dist/lib/constants.js')) as {
    MIDDLEWARE_FILENAME: string;
  };
  const entry = (await import(`../../${MIDDLEWARE_FILENAME}.ts`)) as Record<string, unknown>;
  const handler = entry[MIDDLEWARE_FILENAME] ?? entry.default;
  assert.equal(typeof handler, 'function');

  const response = await (
    handler as (request: InstanceType<typeof NextRequest>) => Promise<Response>
  )(new NextRequest('https://admin.example/analytics'));
  assert.equal(
    response.headers.get('location')?.replace('https://admin.example', ''),
    '/login?reason=auth'
  );
});

test('an unconfigured deployment reaches the setup card instead of failing every request', async () => {
  // The dashboard layout renders AdminSetupCard when env keys are missing. Now that the
  // middleware actually runs, throwing on missing env here would 500 every page first.
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    assert.deepEqual(await visit('/analytics'), { next: true });
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  }
});

test('the Vercel cron endpoint is not bounced to login: it has its own bearer-secret gate', async () => {
  // Cron requests carry no session cookie. Redirecting them would stop the daily upstream sync.
  assert.deepEqual(await visit('/api/cron/upstream-sync'), { next: true });
});
