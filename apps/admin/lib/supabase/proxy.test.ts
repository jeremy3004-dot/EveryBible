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
