import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import {
  captureRedirect,
  createSupabaseFake,
  makeFakeUser,
  mockModule,
  mockNextServerRuntime,
  stepArgs,
} from './testing/adminTestHarness';

// The cookie-bound client answers "who is signed in"; the service-role client
// reads profiles.admin_role. They are different clients in production too.
const sessionClient = createSupabaseFake();
const serviceClient = createSupabaseFake();
let serviceClientCreations = 0;

mockModule(mock, '@/lib/supabase/server', {
  createAdminServerClient: async () => sessionClient.client,
});
mockModule(mock, '@/lib/supabase/service', {
  createAdminServiceClient: () => {
    serviceClientCreations += 1;
    return serviceClient.client;
  },
});
mockNextServerRuntime(mock);

const { getAdminIdentity, requireAdminIdentity } = await import('./admin-auth');

function signIn(overrides: Parameters<typeof makeFakeUser>[0] = {}) {
  sessionClient.auth.setUser(
    makeFakeUser({ id: 'user-7', email: 'person@church.org', ...overrides })
  );
}

function profileRow(row: Record<string, unknown> | null) {
  serviceClient.respondTo('profiles', () => ({ data: row }));
}

beforeEach(() => {
  sessionClient.reset();
  serviceClient.reset();
  sessionClient.auth.setUser(null);
  serviceClientCreations = 0;
});

test('a signed-out visitor has no admin identity and no profile is read', async () => {
  assert.equal(await getAdminIdentity(), null);
  assert.equal(serviceClientCreations, 0);
  assert.equal(serviceClient.calls.length, 0);
});

test('the signed-in user is resolved through the server-verified getUser, not the cookie session', async () => {
  signIn();
  profileRow(null);
  await getAdminIdentity();
  assert.deepEqual(
    sessionClient.authCalls.map((call) => call.method),
    ['getUser']
  );
});

test('the admin_role lookup reads the signed-in user’s own profile row', async () => {
  signIn({ id: 'user-42' });
  profileRow(null);
  await getAdminIdentity();
  const [call] = serviceClient.callsFor('profiles');
  assert.equal(call.columns, 'id, email, display_name, admin_role');
  assert.deepEqual(stepArgs(call, 'eq'), [['id', 'user-42']]);
  assert.equal(call.maybeSingle, true);
});

for (const [label, row] of [
  ['no profile row', null],
  ['a null admin_role', { id: 'user-7', email: null, display_name: null, admin_role: null }],
  ['an unknown admin_role', { id: 'user-7', email: null, display_name: null, admin_role: 'admin' }],
  [
    'a differently cased admin_role',
    { id: 'user-7', email: null, display_name: null, admin_role: 'SUPER_ADMIN' },
  ],
  [
    'an admin_role with surrounding whitespace',
    { id: 'user-7', email: null, display_name: null, admin_role: ' super_admin' },
  ],
] as const) {
  test(`a signed-in user with ${label} is not an admin`, async () => {
    signIn();
    profileRow(row);
    assert.equal(await getAdminIdentity(), null);
    assert.equal(await captureRedirect(() => requireAdminIdentity()), '/login?reason=forbidden');
  });
}

test('a super_admin profile yields the admin identity from the profile row', async () => {
  signIn();
  profileRow({
    id: 'user-7',
    email: 'ops@everybible.app',
    display_name: 'Ops Lead',
    admin_role: 'super_admin',
  });
  const expected = {
    email: 'ops@everybible.app',
    id: 'user-7',
    name: 'Ops Lead',
    role: 'super_admin',
  };
  assert.deepEqual(await getAdminIdentity(), expected);
  assert.deepEqual(await requireAdminIdentity(), expected);
});

test('a super_admin without profile email or name falls back to the auth email', async () => {
  signIn({ email: 'fallback@everybible.app' });
  profileRow({ id: 'user-7', email: null, display_name: null, admin_role: 'super_admin' });
  assert.deepEqual(await getAdminIdentity(), {
    email: 'fallback@everybible.app',
    id: 'user-7',
    name: 'fallback@everybible.app',
    role: 'super_admin',
  });
});

test('a profile lookup failure fails closed instead of granting or silently denying access', async () => {
  signIn();
  serviceClient.respondTo('profiles', () => ({ data: null, error: { message: 'timeout' } }));
  await assert.rejects(getAdminIdentity(), /Unable to load admin profile: timeout/);
  await assert.rejects(requireAdminIdentity(), /Unable to load admin profile: timeout/);
});

test('requireAdminIdentity sends a signed-out visitor to login without reading profiles', async () => {
  assert.equal(await captureRedirect(() => requireAdminIdentity()), '/login?reason=auth');
  assert.equal(serviceClient.calls.length, 0);
});

test('an expired or invalid session is treated as signed out', async () => {
  sessionClient.auth.handlers.getUser = async () => ({
    data: { user: null },
    error: { message: 'invalid JWT', status: 401 },
  });
  assert.equal(await getAdminIdentity(), null);
  assert.equal(await captureRedirect(() => requireAdminIdentity()), '/login?reason=auth');
  assert.equal(serviceClient.calls.length, 0);
});
