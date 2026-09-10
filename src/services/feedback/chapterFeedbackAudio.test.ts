import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

/**
 * `mockSupabaseModule` fixes `isSupabaseConfigured()` at install time; this
 * module's first branch depends on it, so the barrel is mocked directly with a
 * mutable flag.
 */
const fake = createSupabaseFake();
const backend = { configured: true };
const supabaseExports = {
  supabase: fake.client,
  isSupabaseConfigured: () => backend.configured,
  getCurrentUserId: async () => 'user-1',
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

interface FileEntry {
  size?: number;
  base64: string;
}

const files = new Map<string, FileEntry>();
const reads: Array<{ uri: string; options: unknown }> = [];
let infoFailure: Error | null = null;
let readFailure: unknown = null;

mockModule(mock, 'expo-file-system/legacy', {
  getInfoAsync: async (uri: string) => {
    if (infoFailure) {
      throw infoFailure;
    }
    const entry = files.get(uri);
    if (!entry) {
      return { exists: false, uri };
    }
    return entry.size === undefined
      ? { exists: true, uri }
      : { exists: true, uri, size: entry.size, isDirectory: false };
  },
  readAsStringAsync: async (uri: string, options: unknown) => {
    reads.push({ uri, options });
    if (readFailure) {
      throw readFailure;
    }
    return files.get(uri)?.base64 ?? '';
  },
});

let audio: typeof import('./chapterFeedbackAudio');

const context = { translationId: 'BSB', bookId: 'JHN', chapter: 3 };

/** Stores a file whose recorded size matches its base64 payload. */
const putFile = (uri: string, bytes: number, size?: number) => {
  const base64 = Buffer.alloc(bytes, 7).toString('base64');
  files.set(uri, { base64, size: size ?? bytes });
  return base64;
};

before(async () => {
  audio = await import('./chapterFeedbackAudio');
});

beforeEach(() => {
  files.clear();
  reads.length = 0;
  infoFailure = null;
  readFailure = null;
  backend.configured = true;
});

test('the published limits match what the recorder UI is expected to enforce', () => {
  assert.deepEqual(
    {
      bucket: audio.CHAPTER_FEEDBACK_AUDIO_BUCKET,
      maxDurationMs: audio.CHAPTER_FEEDBACK_AUDIO_MAX_DURATION_MS,
      maxSizeBytes: audio.CHAPTER_FEEDBACK_AUDIO_MAX_SIZE_BYTES,
      mimeType: audio.CHAPTER_FEEDBACK_AUDIO_MIME_TYPE,
      extension: audio.CHAPTER_FEEDBACK_AUDIO_EXTENSION,
    },
    {
      bucket: 'chapter-feedback-audio',
      maxDurationMs: 60_000,
      maxSizeBytes: 5 * 1024 * 1024,
      mimeType: 'audio/mp4',
      extension: 'm4a',
    }
  );
});

test('a valid recording is accepted with its base64 payload and metadata', async () => {
  const base64 = putFile('file:///rec.m4a', 1_024);

  const result = await audio.uploadChapterFeedbackAudio(
    { uri: 'file:///rec.m4a', durationMs: 4_200 },
    context
  );

  assert.equal(result.success, true);
  assert.deepEqual(
    { ...result.data, createdAt: undefined },
    {
      bucket: 'chapter-feedback-audio',
      path: null,
      durationMs: 4_200,
      mimeType: 'audio/mp4',
      sizeBytes: 1_024,
      base64Data: base64,
      createdAt: undefined,
    }
  );
  assert.match(result.data?.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('the recording is read as base64 from the legacy file system API', async () => {
  putFile('file:///rec.m4a', 64);

  await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: 1_000 }, context);

  assert.deepEqual(reads, [{ uri: 'file:///rec.m4a', options: { encoding: 'base64' } }]);
});

test('a fractional duration is rounded to whole milliseconds', async () => {
  putFile('file:///rec.m4a', 64);

  const result = await audio.uploadChapterFeedbackAudio(
    { uri: 'file:///rec.m4a', durationMs: 1_234.7 },
    context
  );

  assert.equal(result.data?.durationMs, 1_235);
});

test('a build without a backend refuses the upload before touching the file system', async () => {
  backend.configured = false;

  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: 4_000 }, context),
    { success: false, error: 'EveryBible backend is not configured for this build yet.' }
  );
  assert.deepEqual(reads, []);
});

test('a recording under half a second is rejected as too short', async () => {
  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: 499 }, context),
    { success: false, error: 'Please record at least a short audio response.' }
  );
});

test('a negative duration is clamped and rejected as too short', async () => {
  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: -5_000 }, context),
    { success: false, error: 'Please record at least a short audio response.' }
  );
});

test('a recording of exactly one minute is still accepted', async () => {
  putFile('file:///rec.m4a', 128);

  const result = await audio.uploadChapterFeedbackAudio(
    { uri: 'file:///rec.m4a', durationMs: 60_000 },
    context
  );

  assert.equal(result.success, true);
});

test('a recording longer than one minute is rejected', async () => {
  putFile('file:///rec.m4a', 128);

  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: 60_001 }, context),
    { success: false, error: 'Audio responses must be 1 minute or shorter.' }
  );
});

test('a recording whose file has disappeared is reported instead of uploaded', async () => {
  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///gone.m4a', durationMs: 4_000 }, context),
    { success: false, error: 'The recorded audio file could not be found.' }
  );
  assert.deepEqual(reads, []);
});

test('a recording larger than five megabytes is rejected', async () => {
  files.set('file:///rec.m4a', { base64: '', size: 5 * 1024 * 1024 + 1 });

  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: 30_000 }, context),
    { success: false, error: 'Audio responses must be 5 MB or smaller.' }
  );
  assert.deepEqual(reads, []);
});

test('a recording of exactly five megabytes is accepted', async () => {
  putFile('file:///rec.m4a', 5 * 1024 * 1024);

  const result = await audio.uploadChapterFeedbackAudio(
    { uri: 'file:///rec.m4a', durationMs: 30_000 },
    context
  );

  assert.equal(result.success, true);
  assert.equal(result.data?.sizeBytes, 5 * 1024 * 1024);
});

test('a file whose size the platform does not report is still accepted', async () => {
  files.set('file:///rec.m4a', { base64: Buffer.alloc(64, 7).toString('base64') });

  const result = await audio.uploadChapterFeedbackAudio(
    { uri: 'file:///rec.m4a', durationMs: 4_000 },
    context
  );

  assert.equal(result.success, true);
  assert.equal(result.data?.sizeBytes, null);
});

test('a truncated read that does not match the reported size is rejected', async () => {
  files.set('file:///rec.m4a', {
    base64: Buffer.alloc(10, 7).toString('base64'),
    size: 1_024,
  });

  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: 4_000 }, context),
    { success: false, error: 'The recorded audio file could not be read.' }
  );
});

for (const bytes of [1_023, 1_024, 1_025]) {
  test(`a ${bytes}-byte payload with ${bytes % 3} bytes of base64 padding validates`, async () => {
    putFile('file:///rec.m4a', bytes);

    const result = await audio.uploadChapterFeedbackAudio(
      { uri: 'file:///rec.m4a', durationMs: 4_000 },
      context
    );

    assert.equal(result.success, true, 'base64 padding must not be counted as payload bytes');
    assert.equal(result.data?.sizeBytes, bytes);
  });
}

test('a file system failure while inspecting the recording is surfaced', async () => {
  infoFailure = new Error('storage unavailable');

  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: 4_000 }, context),
    { success: false, error: 'storage unavailable' }
  );
});

test('a non-Error file system failure falls back to a generic message', async () => {
  putFile('file:///rec.m4a', 64);
  readFailure = 'unreadable';

  assert.deepEqual(
    await audio.uploadChapterFeedbackAudio({ uri: 'file:///rec.m4a', durationMs: 4_000 }, context),
    { success: false, error: 'Unable to upload audio response.' }
  );
});

test('the attachment names the chapter feedback bucket but leaves the remote path unset', async () => {
  putFile('file:///rec.m4a', 64);

  const result = await audio.uploadChapterFeedbackAudio(
    { uri: 'file:///rec.m4a', durationMs: 4_000 },
    context
  );

  assert.equal(result.data?.bucket, audio.CHAPTER_FEEDBACK_AUDIO_BUCKET);
  assert.equal(result.data?.path, null, 'the edge function performs the actual upload');
  assert.deepEqual(fake.storageCalls, []);
});

test('an empty recording file is currently accepted when the platform reports a zero size', async () => {
  // Documents present behaviour: the size guard is `sizeBytes && sizeBytes > max`,
  // so a reported size of 0 skips both the size check and the base64 length check.
  files.set('file:///rec.m4a', { base64: '', size: 0 });

  const result = await audio.uploadChapterFeedbackAudio(
    { uri: 'file:///rec.m4a', durationMs: 4_000 },
    context
  );

  assert.equal(result.success, true);
  assert.equal(result.data?.sizeBytes, 0);
  assert.equal(result.data?.base64Data, '');
});
