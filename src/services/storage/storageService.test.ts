import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

/**
 * `mockSupabaseModule` fixes `isSupabaseConfigured()` at install time; these
 * tests need to toggle both configuration and sign-in state, so the barrel is
 * mocked directly with mutable getters instead.
 */
const fake = createSupabaseFake();
const backend = { configured: true, userId: 'user-1' as string | null };
const supabaseExports = {
  supabase: fake.client,
  isSupabaseConfigured: () => backend.configured,
  getCurrentUserId: async () => (backend.configured ? backend.userId : null),
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

/** In-memory file tree keyed by URI, holding the base64 payload each read returns. */
const files = new Map<string, string>();
const reads: Array<{ uri: string; options: unknown }> = [];
let readFailure: Error | null = null;
// storageService imports the SDK 54 legacy entry point (the root export dropped
// readAsStringAsync/getInfoAsync), so that is the specifier to intercept.
mockModule(mock, 'expo-file-system/legacy', {
  readAsStringAsync: async (uri: string, options: unknown) => {
    reads.push({ uri, options });
    if (readFailure) {
      throw readFailure;
    }
    const contents = files.get(uri);
    if (contents === undefined) {
      throw new Error(`File does not exist: ${uri}`);
    }
    return contents;
  },
  getInfoAsync: async (uri: string) => ({ exists: files.has(uri), uri }),
});

let storage: typeof import('./storageService');

const base64 = (text: string) => Buffer.from(text, 'binary').toString('base64');
const bytesOf = (text: string) => new Uint8Array(Buffer.from(text, 'binary'));
const uploadsTo = (bucket: string) =>
  fake.storageCalls.filter((call) => call.bucket === bucket && call.method === 'upload');

before(async () => {
  storage = await import('./storageService');
});

beforeEach(() => {
  fake.reset();
  files.clear();
  reads.length = 0;
  readFailure = null;
  backend.configured = true;
  backend.userId = 'user-1';
});

// ─── Avatar upload ───────────────────────────────────────────────────────────

test('uploading an avatar stores it under the user folder and returns its public URL', async () => {
  files.set('file:///tmp/pick.png', base64('png-bytes'));

  const result = await storage.uploadAvatar('file:///tmp/pick.png');

  assert.deepEqual(result, {
    success: true,
    data: `${fake.storage.publicUrlBase}/avatars/user-1/avatar.png`,
  });
  const [upload] = uploadsTo('avatars');
  assert.equal(upload.args[0], 'user-1/avatar.png');
  assert.deepEqual(upload.args[1], bytesOf('png-bytes'));
  assert.deepEqual(upload.args[2], { contentType: 'image/png', upsert: true });
});

test('the avatar is read as base64 from the local URI', async () => {
  files.set('file:///tmp/pick.png', base64('png-bytes'));

  await storage.uploadAvatar('file:///tmp/pick.png');

  assert.deepEqual(reads, [{ uri: 'file:///tmp/pick.png', options: { encoding: 'base64' } }]);
});

for (const [extension, contentType] of [
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
] as const) {
  test(`a .${extension} pick is uploaded as ${contentType}`, async () => {
    files.set(`file:///tmp/pick.${extension}`, base64('data'));

    await storage.uploadAvatar(`file:///tmp/pick.${extension}`);

    assert.equal(
      (uploadsTo('avatars')[0].args[2] as { contentType: string }).contentType,
      contentType
    );
  });
}

test('an uppercase extension is normalised before the mime type is chosen', async () => {
  files.set('file:///tmp/PICK.PNG', base64('data'));

  await storage.uploadAvatar('file:///tmp/PICK.PNG');

  const [upload] = uploadsTo('avatars');
  assert.equal(upload.args[0], 'user-1/avatar.png');
  assert.equal((upload.args[2] as { contentType: string }).contentType, 'image/png');
});

test('a query string after the extension does not confuse extension detection', async () => {
  files.set('file:///tmp/pick.webp?width=200', base64('data'));

  await storage.uploadAvatar('file:///tmp/pick.webp?width=200');

  assert.equal(uploadsTo('avatars')[0].args[0], 'user-1/avatar.webp');
});

test('an Android content:// URI with no extension falls back to a jpeg avatar', async () => {
  files.set('content://media/external/images/1', base64('data'));

  await storage.uploadAvatar('content://media/external/images/1');

  const [upload] = uploadsTo('avatars');
  assert.equal(upload.args[0], 'user-1/avatar.jpg');
  assert.equal((upload.args[2] as { contentType: string }).contentType, 'image/jpeg');
});

test('an unknown extension falls back to a jpeg content type', async () => {
  files.set('file:///tmp/pick.bmp', base64('data'));

  await storage.uploadAvatar('file:///tmp/pick.bmp');

  const [upload] = uploadsTo('avatars');
  assert.equal(upload.args[0], 'user-1/avatar.bmp');
  assert.equal((upload.args[2] as { contentType: string }).contentType, 'image/jpeg');
});

test('uploading an avatar without a backend reports that Supabase is unconfigured', async () => {
  backend.configured = false;

  assert.deepEqual(await storage.uploadAvatar('file:///tmp/pick.png'), {
    success: false,
    error: 'Supabase not configured',
  });
  assert.deepEqual(fake.storageCalls, []);
});

test('uploading an avatar while signed out is refused before any file is read', async () => {
  backend.userId = null;

  assert.deepEqual(await storage.uploadAvatar('file:///tmp/pick.png'), {
    success: false,
    error: 'Not signed in',
  });
  assert.deepEqual(reads, []);
});

test('an unreadable local file surfaces the file system error', async () => {
  readFailure = new Error('permission denied');

  assert.deepEqual(await storage.uploadAvatar('file:///tmp/pick.png'), {
    success: false,
    error: 'permission denied',
  });
});

test('a non-Error failure while uploading is reported as an unknown error', async () => {
  fake.storage.respond('avatars', 'upload', () => {
    throw 'bucket exploded';
  });
  files.set('file:///tmp/pick.png', base64('data'));

  assert.deepEqual(await storage.uploadAvatar('file:///tmp/pick.png'), {
    success: false,
    error: 'Unknown error',
  });
});

test('a rejected avatar upload surfaces the storage error message', async () => {
  files.set('file:///tmp/pick.png', base64('data'));
  fake.storage.respond('avatars', 'upload', () => ({
    data: null,
    error: { message: 'The object exceeded the maximum allowed size' },
  }));

  assert.deepEqual(await storage.uploadAvatar('file:///tmp/pick.png'), {
    success: false,
    error: 'The object exceeded the maximum allowed size',
  });
});

// ─── Group images ────────────────────────────────────────────────────────────

test('uploading a group cover stores it under the group folder and returns its public URL', async () => {
  files.set('file:///tmp/cover.jpeg', base64('cover-bytes'));

  const result = await storage.uploadGroupImage('group-7', 'file:///tmp/cover.jpeg');

  assert.deepEqual(result, {
    success: true,
    data: `${fake.storage.publicUrlBase}/group-images/group-7/cover.jpeg`,
  });
  const [upload] = uploadsTo('group-images');
  assert.equal(upload.args[0], 'group-7/cover.jpeg');
  assert.deepEqual(upload.args[1], bytesOf('cover-bytes'));
  assert.deepEqual(upload.args[2], { contentType: 'image/jpeg', upsert: true });
});

test('uploading a group cover without a backend reports that Supabase is unconfigured', async () => {
  backend.configured = false;

  assert.deepEqual(await storage.uploadGroupImage('group-7', 'file:///tmp/cover.jpg'), {
    success: false,
    error: 'Supabase not configured',
  });
});

test('uploading a group cover while signed out is refused before any file is read', async () => {
  backend.userId = null;

  assert.deepEqual(await storage.uploadGroupImage('group-7', 'file:///tmp/cover.jpg'), {
    success: false,
    error: 'Not signed in',
  });
  assert.deepEqual(reads, []);
});

test('a rejected group cover upload surfaces the storage error message', async () => {
  files.set('file:///tmp/cover.jpg', base64('data'));
  fake.storage.respond('group-images', 'upload', () => ({
    data: null,
    error: { message: 'Only the group leader may upload' },
  }));

  assert.deepEqual(await storage.uploadGroupImage('group-7', 'file:///tmp/cover.jpg'), {
    success: false,
    error: 'Only the group leader may upload',
  });
});

test('an unreadable group cover surfaces the file system error', async () => {
  readFailure = new Error('permission denied');

  assert.deepEqual(await storage.uploadGroupImage('group-7', 'file:///tmp/cover.jpg'), {
    success: false,
    error: 'permission denied',
  });
});

test('a non-Error group cover failure is reported as an unknown error', async () => {
  files.set('file:///tmp/cover.jpg', base64('data'));
  fake.storage.respond('group-images', 'upload', () => {
    throw 'bucket exploded';
  });

  assert.deepEqual(await storage.uploadGroupImage('group-7', 'file:///tmp/cover.jpg'), {
    success: false,
    error: 'Unknown error',
  });
});

test('deleting a group cover removes every file variant in the group folder', async () => {
  fake.storage.respond('group-images', 'list', () => ({
    data: [{ name: 'cover.jpg' }, { name: 'cover.webp' }],
    error: null,
  }));

  assert.deepEqual(await storage.deleteGroupImage('group-7'), { success: true });
  const remove = fake.storageCalls.find((call) => call.method === 'remove');
  assert.deepEqual(remove?.args[0], ['group-7/cover.jpg', 'group-7/cover.webp']);
});

test('deleting a group cover that does not exist succeeds without a remove call', async () => {
  fake.storage.respond('group-images', 'list', () => ({ data: [], error: null }));

  assert.deepEqual(await storage.deleteGroupImage('group-7'), { success: true });
  assert.equal(
    fake.storageCalls.some((call) => call.method === 'remove'),
    false
  );
});

test('a failed group cover listing surfaces the storage error', async () => {
  fake.storage.respond('group-images', 'list', () => ({
    data: null,
    error: { message: 'Not authorized' },
  }));

  assert.deepEqual(await storage.deleteGroupImage('group-7'), {
    success: false,
    error: 'Not authorized',
  });
});

test('a failed group cover removal surfaces the storage error', async () => {
  fake.storage.respond('group-images', 'list', () => ({
    data: [{ name: 'cover.jpg' }],
    error: null,
  }));
  fake.storage.respond('group-images', 'remove', () => ({
    data: null,
    error: { message: 'Object not found' },
  }));

  assert.deepEqual(await storage.deleteGroupImage('group-7'), {
    success: false,
    error: 'Object not found',
  });
});

test('an exception while deleting a group cover is reported rather than thrown', async () => {
  fake.storage.respond('group-images', 'list', () => {
    throw new Error('offline');
  });

  assert.deepEqual(await storage.deleteGroupImage('group-7'), { success: false, error: 'offline' });
});

test('deleting a group cover without a backend reports that Supabase is unconfigured', async () => {
  backend.configured = false;

  assert.deepEqual(await storage.deleteGroupImage('group-7'), {
    success: false,
    error: 'Supabase not configured',
  });
});

test('deleting a group cover while signed out is refused', async () => {
  backend.userId = null;

  assert.deepEqual(await storage.deleteGroupImage('group-7'), {
    success: false,
    error: 'Not signed in',
  });
});

test('the group cover URL is derived from the storage path convention', () => {
  assert.equal(
    storage.getGroupImageUrl('group-7'),
    `${fake.storage.publicUrlBase}/group-images/group-7/cover.jpg`
  );
});

test('the group cover URL is null without a backend', () => {
  backend.configured = false;

  assert.equal(storage.getGroupImageUrl('group-7'), null);
});
