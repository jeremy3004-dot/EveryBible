import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import {
  captureRedirect,
  createSupabaseFake,
  formData,
  mockModule,
  mockNextServerRuntime,
} from '../../../lib/testing/adminTestHarness';

const session = createSupabaseFake();
mockModule(mock, '@/lib/supabase/server', { createAdminServerClient: async () => session.client });
mockNextServerRuntime(mock);

const { loginAction, signOutAction } = await import('./actions');

beforeEach(() => session.reset());

test('signing in with a password opens the analytics globe', async () => {
  const url = await captureRedirect(() =>
    loginAction(formData({ email: 'ops@everybible.app', password: 'secret' }))
  );
  assert.equal(url, '/analytics');
  assert.deepEqual(session.authCalls, [
    { method: 'signInWithPassword', args: [{ email: 'ops@everybible.app', password: 'secret' }] },
  ]);
});

test('a rejected sign-in returns to login with the reason', async () => {
  session.auth.handlers.signInWithPassword = async () => ({
    data: { user: null, session: null },
    error: { message: 'Invalid login credentials' },
  });
  const url = await captureRedirect(() =>
    loginAction(formData({ email: 'ops@everybible.app', password: 'wrong' }))
  );
  assert.equal(url, '/login?error=Invalid%20login%20credentials');
});

test('a sign-in without credentials does not reach Supabase', async () => {
  const url = await captureRedirect(() => loginAction(formData({ email: 'ops@everybible.app' })));
  assert.equal(url, '/login?error=Missing credentials');
  assert.deepEqual(session.authCalls, []);
});

test('signing out ends the Supabase session and confirms it', async () => {
  const url = await captureRedirect(() => signOutAction());
  assert.deepEqual(
    session.authCalls.map((call) => call.method),
    ['signOut']
  );
  assert.equal(url, '/login?notice=Signed out successfully');
});
