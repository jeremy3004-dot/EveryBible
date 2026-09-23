import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake, makeFakeUser } from '../../testing/supabaseFake';

const supabaseFake = createSupabaseFake();
const USER_ID = '6f1c2a4e-0000-4000-8000-00000000abcd';

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
  supabaseFake.auth.setUser(makeFakeUser({ id: USER_ID }));
});

type ListEntry = { name: string; id: string | null };
type ListOptions = { limit?: number; offset?: number };

/** Script `list()` for a bucket from a map of folder -> entries (folders have `id: null`). */
const scriptBucket = (bucket: string, tree: Record<string, ListEntry[]>) => {
  supabaseFake.storage.respond(bucket, 'list', (folder: unknown, options: unknown) => {
    const { limit = 100, offset = 0 } = (options ?? {}) as ListOptions;
    const entries = tree[String(folder)] ?? [];
    return { data: entries.slice(offset, offset + limit), error: null };
  });
};

const storageCallsFor = (bucket: string, method: string) =>
  supabaseFake.storageCalls.filter((call) => call.bucket === bucket && call.method === method);

const removedPaths = (bucket: string) =>
  storageCallsFor(bucket, 'remove').flatMap((call) => call.args[0] as string[]);

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

test('deleteCurrentAccount removes the caller avatar and every feedback recording before deleting the account', async () => {
  const events: string[] = [];
  scriptBucket('avatars', { [USER_ID]: [{ name: 'avatar.jpg', id: 'obj-avatar' }] });
  // Recordings live at {uid}/{translation}/{book}/{chapter}/{file}.m4a.
  scriptBucket('chapter-feedback-audio', {
    [USER_ID]: [{ name: 'bsb', id: null }],
    [`${USER_ID}/bsb`]: [
      { name: 'jhn', id: null },
      { name: 'gen', id: null },
    ],
    [`${USER_ID}/bsb/jhn`]: [{ name: '3', id: null }],
    [`${USER_ID}/bsb/jhn/3`]: [
      { name: '1-a.m4a', id: 'obj-1' },
      { name: '2-b.m4a', id: 'obj-2' },
    ],
    [`${USER_ID}/bsb/gen`]: [{ name: '1', id: null }],
    [`${USER_ID}/bsb/gen/1`]: [{ name: '3-c.m4a', id: 'obj-3' }],
  });
  for (const bucket of ['avatars', 'chapter-feedback-audio']) {
    supabaseFake.storage.respond(bucket, 'remove', () => {
      events.push(`remove:${bucket}`);
      return { data: [], error: null };
    });
  }
  supabaseFake.respondToRpc('delete_my_account', () => {
    events.push('rpc:delete_my_account');
    return { data: null, error: null };
  });

  assert.deepEqual(await accountService.deleteCurrentAccount(), { success: true });

  assert.deepEqual(removedPaths('avatars'), [`${USER_ID}/avatar.jpg`]);
  assert.deepEqual(removedPaths('chapter-feedback-audio').sort(), [
    `${USER_ID}/bsb/gen/1/3-c.m4a`,
    `${USER_ID}/bsb/jhn/3/1-a.m4a`,
    `${USER_ID}/bsb/jhn/3/2-b.m4a`,
  ]);
  assert.deepEqual(events, [
    'remove:avatars',
    'remove:chapter-feedback-audio',
    'rpc:delete_my_account',
  ]);
});

test('deleteCurrentAccount only lists the caller own storage folders', async () => {
  await accountService.deleteCurrentAccount();

  const listedFolders = supabaseFake.storageCalls
    .filter((call) => call.method === 'list')
    .map((call) => `${call.bucket}:${String(call.args[0])}`)
    .sort();
  assert.deepEqual(listedFolders, [`avatars:${USER_ID}`, `chapter-feedback-audio:${USER_ID}`]);
});

test('deleteCurrentAccount with no stored files deletes the account without removing anything', async () => {
  assert.deepEqual(await accountService.deleteCurrentAccount(), { success: true });

  assert.equal(storageCallsFor('avatars', 'remove').length, 0);
  assert.equal(storageCallsFor('chapter-feedback-audio', 'remove').length, 0);
  assert.equal(supabaseFake.callsFor('rpc:delete_my_account').length, 1);
});

test('deleteCurrentAccount pages through a folder larger than one listing page', async () => {
  const recordings = Array.from({ length: 150 }, (_, index) => ({
    name: `${index}.m4a`,
    id: `obj-${index}`,
  }));
  scriptBucket('chapter-feedback-audio', { [USER_ID]: recordings });

  assert.deepEqual(await accountService.deleteCurrentAccount(), { success: true });

  assert.equal(new Set(removedPaths('chapter-feedback-audio')).size, 150);
});

test('deleteCurrentAccount keeps the account when the caller files cannot be listed', async () => {
  supabaseFake.storage.respond('chapter-feedback-audio', 'list', () => ({
    data: null,
    error: { message: 'storage unavailable' },
  }));

  assert.deepEqual(await accountService.deleteCurrentAccount(), {
    success: false,
    error: 'storage unavailable',
  });
  assert.equal(supabaseFake.callsFor('rpc:delete_my_account').length, 0);
});

test('deleteCurrentAccount keeps the account when a stored file cannot be removed', async () => {
  scriptBucket('avatars', { [USER_ID]: [{ name: 'avatar.png', id: 'obj-avatar' }] });
  supabaseFake.storage.respond('avatars', 'remove', () => ({
    data: null,
    error: { message: 'remove failed' },
  }));

  assert.deepEqual(await accountService.deleteCurrentAccount(), {
    success: false,
    error: 'remove failed',
  });
  assert.equal(supabaseFake.callsFor('rpc:delete_my_account').length, 0);
});

test('deleteCurrentAccount refuses to run for a signed-out caller', async () => {
  supabaseFake.auth.setUser(null);

  assert.deepEqual(await accountService.deleteCurrentAccount(), {
    success: false,
    error: 'Not signed in',
  });
  assert.deepEqual(supabaseFake.calls, []);
  assert.deepEqual(supabaseFake.storageCalls, []);
});
