import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';
import { mockModule, sourcePath } from '../../testing/mockModules';

const fake = createSupabaseFake();
const original = makeFakeSession({
  user: makeFakeUser({ id: 'original-account' }),
  access_token: 'original-delete-token',
});
fake.auth.setSession(original);
let rpcStarted = false;
const requests: { url: string; authorization: string | null }[] = [];
// The installed Supabase client awaits its token provider even with an explicit header.
// Change the account at that exact point; all HTTP is intercepted locally.
const transport = createClient('https://account-delete.invalid', 'fake-public-key', {
  accessToken: async () => {
    if (!rpcStarted) return original.access_token;
    fake.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'next-account' }) }));
    return 'next-account-token';
  },
  global: {
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  },
});
mockModule(mock, sourcePath('services/supabase/index.ts'), {
  supabase: {
    auth: fake.client.auth,
    storage: fake.client.storage,
    rpc: (fn: string) => {
      rpcStarted = true;
      return transport.rpc(fn);
    },
  },
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => fake.auth.user?.id ?? null,
});

test('delete RPC keeps the original Authorization when the client token lookup switches accounts', async () => {
  const { deleteCurrentAccount } = await import('./accountService');
  assert.deepEqual(await deleteCurrentAccount('original-account'), { success: true });
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.ok(request);
  assert.ok(request.url.endsWith('/rest/v1/rpc/delete_my_account'));
  assert.equal(request.authorization, 'Bearer original-delete-token');
  assert.equal(fake.auth.user?.id, 'next-account');
});
