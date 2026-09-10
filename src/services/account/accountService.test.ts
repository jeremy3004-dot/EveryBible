import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

const supabaseFake = createSupabaseFake();

// The shared `mockSupabaseModule` helper freezes `isSupabaseConfigured` at
// install time; this service branches on it, so the flag is mutable here.
let supabaseConfigured = true;
const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => supabaseConfigured,
  getCurrentUserId: async () => supabaseFake.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

let accountService: typeof import('./accountService');

before(async () => {
  accountService = await import('./accountService');
});

beforeEach(() => {
  supabaseConfigured = true;
  supabaseFake.reset();
});

test('deleteCurrentAccount refuses to run when the backend is not configured', async () => {
  supabaseConfigured = false;

  assert.deepEqual(await accountService.deleteCurrentAccount(), {
    success: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
  assert.deepEqual(supabaseFake.calls, []);
});

test('deleteCurrentAccount asks Postgres to delete the caller and reports success', async () => {
  assert.deepEqual(await accountService.deleteCurrentAccount(), { success: true });
  assert.deepEqual(
    supabaseFake.calls.map((call) => ({ table: call.table, operation: call.operation })),
    [{ table: 'rpc:delete_my_account', operation: 'rpc' }]
  );
});

test('deleteCurrentAccount sends no arguments to the delete function', async () => {
  await accountService.deleteCurrentAccount();

  assert.equal(supabaseFake.callsFor('rpc:delete_my_account')[0].payload, undefined);
});

test('deleteCurrentAccount surfaces a rejected delete so the UI can keep the account', async () => {
  supabaseFake.respondToRpc('delete_my_account', () => ({
    data: null,
    error: { message: 'permission denied for function delete_my_account' },
  }));

  assert.deepEqual(await accountService.deleteCurrentAccount(), {
    success: false,
    error: 'permission denied for function delete_my_account',
  });
});

test('deleteCurrentAccount surfaces a thrown transport error', async () => {
  supabaseFake.respondToRpc('delete_my_account', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await accountService.deleteCurrentAccount(), {
    success: false,
    error: 'Network request failed',
  });
});

test('deleteCurrentAccount reports a generic message when something non-Error is thrown', async () => {
  supabaseFake.respondToRpc('delete_my_account', () => {
    throw 'gateway timeout';
  });

  assert.deepEqual(await accountService.deleteCurrentAccount(), {
    success: false,
    error: 'Unknown error',
  });
});
