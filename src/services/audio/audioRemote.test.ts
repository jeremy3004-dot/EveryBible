import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRemoteAudioCache,
  fetchRemoteChapterAudio,
  getFirstAvailableAudioBook,
  getRemoteAudioFileExtension,
  isRemoteAudioAvailable,
  setElManifestChapterResolverForTests,
  setRemoteAudioMetadataResolver,
} from './audioRemote';

test.afterEach(() => {
  clearRemoteAudioCache();
  setRemoteAudioMetadataResolver(null);
  setElManifestChapterResolverForTests(null);
});

test('berean standard bible audio resolves through the EveryBible media route when Supabase base URL is not configured', async () => {
  const audio = await fetchRemoteChapterAudio('bsb', 'GEN', 1);

  assert.deepEqual(audio, {
    url: 'https://media.everybible.app/audio/bsb/GEN/1.m4a',
    duration: 0,
  });
});

test('berean standard bible audio resolves numbered-book chapters through the EveryBible media route', async () => {
  const audio = await fetchRemoteChapterAudio('bsb', '1CO', 13);

  assert.deepEqual(audio, {
    url: 'https://media.everybible.app/audio/bsb/1CO/13.m4a',
    duration: 0,
  });
});

test('berean standard bible audio resolves psalms chapters through the EveryBible media route', async () => {
  const audio = await fetchRemoteChapterAudio('bsb', 'PSA', 150);

  assert.deepEqual(audio, {
    url: 'https://media.everybible.app/audio/bsb/PSA/150.m4a',
    duration: 0,
  });
});

test('runtime stream-template audio can still resolve through a custom remote base url', async () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'bsb') {
      return null;
    }

    return {
      id: 'bsb',
      hasAudio: true,
      audio: {
        strategy: 'stream-template',
        baseUrl: 'https://example.supabase.co/storage/v1/object/public/bible-audio/bsb',
        chapterPathTemplate: '{bookId}/{chapter}.m4a',
      },
    };
  });

  const audio = await fetchRemoteChapterAudio('bsb', 'GEN', 1);

  assert.deepEqual(audio, {
    url: 'https://example.supabase.co/storage/v1/object/public/bible-audio/bsb/GEN/1.m4a',
    duration: 0,
  });
  assert.equal(isRemoteAudioAvailable('bsb'), true);
});

test('world english bible audio resolves through the EveryBible media route', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'GEN', 1);

  assert.deepEqual(audio, {
    url: 'https://media.everybible.app/audio/web/GEN/1.mp3',
    duration: 0,
  });
});

test('world english bible audio supports psalms chapter filenames through the EveryBible media route', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'PSA', 150);

  assert.deepEqual(audio, {
    url: 'https://media.everybible.app/audio/web/PSA/150.mp3',
    duration: 0,
  });
});

test('world english bible audio resolves any direct chapter path the R2 catalog provides', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'XXX', 1);

  assert.deepEqual(audio, {
    url: 'https://media.everybible.app/audio/web/XXX/1.mp3',
    duration: 0,
  });
});

test('world english bible audio returns null for invalid chapters', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'GEN', 0);

  assert.equal(audio, null);
});

test('world english bible audio remains remotely available through the EveryBible media route', () => {
  assert.equal(isRemoteAudioAvailable('web'), true);
});

test('bsb audio remains remotely available when the EveryBible media route is the fallback', () => {
  assert.equal(isRemoteAudioAvailable('bsb'), true);
});

test('translations without configured audio remain unavailable remotely', () => {
  assert.equal(isRemoteAudioAvailable('kjv'), false);
});

test('remote audio availability respects explicit per-book coverage before playback starts', async () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'npiulb') {
      return null;
    }

    return {
      id: 'npiulb',
      hasAudio: true,
      audio: {
        strategy: 'stream-template',
        coverage: 'new-testament',
        books: {
          MAT: { totalChapters: 28 },
          JHN: { totalChapters: 21 },
        },
        baseUrl: 'https://media.everybible.app/audio/npiulb/2026.04.05-open-bible-audio-v1',
        chapterPathTemplate: 'chapters/{bookId}/{chapter}.mp3',
      },
    };
  });

  assert.equal(isRemoteAudioAvailable('npiulb'), true);
  assert.equal(isRemoteAudioAvailable('npiulb', 'JHN'), true);
  assert.equal(isRemoteAudioAvailable('npiulb', 'GEN'), false);
  assert.equal(await fetchRemoteChapterAudio('npiulb', 'GEN', 1), null);
  assert.deepEqual(await fetchRemoteChapterAudio('npiulb', 'JHN', 3), {
    url: 'https://media.everybible.app/audio/npiulb/2026.04.05-open-bible-audio-v1/chapters/JHN/3.mp3',
    duration: 0,
  });
});

test('runtime stream-template audio resolves through the injected metadata resolver', async () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'niv') {
      return null;
    }

    return {
      id: 'niv',
      hasAudio: true,
      audio: {
        strategy: 'stream-template',
        baseUrl: 'https://cdn.example.com/audio/niv',
        chapterPathTemplate: '{bookId}/{chapter}.mp3',
      },
    };
  });

  const audio = await fetchRemoteChapterAudio('niv', 'JHN', 3);

  assert.deepEqual(audio, {
    url: 'https://cdn.example.com/audio/niv/JHN/3.mp3',
    duration: 0,
  });
  assert.equal(isRemoteAudioAvailable('niv'), true);
});

test('runtime stream-template audio exposes its configured file extension for local downloads', () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'niv') {
      return null;
    }

    return {
      id: 'niv',
      hasAudio: true,
      fileExtension: 'm4a',
      audio: {
        strategy: 'stream-template',
        baseUrl: 'https://cdn.example.com/audio/niv',
        chapterPathTemplate: '{bookId}/{chapter}.m4a',
      },
    };
  });

  assert.equal(getRemoteAudioFileExtension('niv'), 'm4a');
});

test('runtime provider audio resolves through the injected metadata resolver', async () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'esv') {
      return null;
    }

    return {
      id: 'esv',
      hasAudio: true,
      audio: {
        strategy: 'provider',
        provider: 'ebible-webbe',
      },
    };
  });

  const audio = await fetchRemoteChapterAudio('esv', 'ROM', 8);

  assert.deepEqual(audio, {
    url: 'https://ebible.org/eng-webbe/mp3/eng-webbe_075_ROM_08.mp3',
    duration: 0,
  });
  assert.equal(isRemoteAudioAvailable('esv'), true);
});

function elManifestMetadata(translationId: string) {
  return {
    id: translationId,
    hasAudio: true as const,
    fileExtension: 'mp3',
    audio: {
      strategy: 'el-manifest' as const,
      manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-1.json',
      audioVersion: 'v2026-07-20-1',
      catalogBaseUrl: 'https://media.example.test',
    },
  };
}

test('el-manifest audio resolves a chapter URL through the injected manifest-service double', async () => {
  setRemoteAudioMetadataResolver((translationId) =>
    translationId === 'lqdtest' ? elManifestMetadata('lqdtest') : null
  );

  const calls: Array<{ ref: unknown; bookId: string; chapter: number }> = [];
  setElManifestChapterResolverForTests(async (ref, bookId, chapter) => {
    calls.push({ ref, bookId, chapter });
    if (bookId === 'JHN' && chapter === 1) {
      return {
        url: 'https://media.example.test/audio/lqdtest/v2026-07-20-1/chapters/JHN/1.mp3',
        mimeType: 'audio/mpeg',
        fileExt: 'mp3',
        bytes: 2703104,
        durationMs: 225000,
      };
    }
    return null;
  });

  const audio = await fetchRemoteChapterAudio('lqdtest', 'JHN', 1);

  assert.deepEqual(audio, {
    url: 'https://media.example.test/audio/lqdtest/v2026-07-20-1/chapters/JHN/1.mp3',
    duration: 225000,
  });
  assert.equal(calls.length, 1);
  assert.equal(getRemoteAudioFileExtension('lqdtest'), 'mp3');
  assert.equal(isRemoteAudioAvailable('lqdtest'), true);
});

test('el-manifest audio returns null for a chapter absent from the manifest', async () => {
  setRemoteAudioMetadataResolver((translationId) =>
    translationId === 'lqdtest' ? elManifestMetadata('lqdtest') : null
  );
  setElManifestChapterResolverForTests(async () => null);

  const audio = await fetchRemoteChapterAudio('lqdtest', 'JHN', 99);
  assert.equal(audio, null);
});

test('el-manifest audio returns null (no throw) when the manifest is unavailable', async () => {
  setRemoteAudioMetadataResolver((translationId) =>
    translationId === 'lqdtest' ? elManifestMetadata('lqdtest') : null
  );
  setElManifestChapterResolverForTests(async () => {
    throw new Error('manifest verification failed');
  });

  const audio = await fetchRemoteChapterAudio('lqdtest', 'JHN', 1);
  assert.equal(audio, null);
});

test('getFirstAvailableAudioBook returns the first New Testament book for NT-only audio (so OT readers can still listen)', () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'ahrahirani') {
      return null;
    }

    return {
      id: 'ahrahirani',
      hasAudio: true,
      audio: {
        strategy: 'stream-template',
        coverage: 'new-testament',
        books: {
          MAT: { totalChapters: 28 },
          MRK: { totalChapters: 16 },
        },
        baseUrl: 'audio/ahrahirani/2026.04.05-open-bible-audio-v2',
        chapterPathTemplate: 'chapters/{bookId}/{chapter}.mp3',
      },
    };
  });

  assert.equal(getFirstAvailableAudioBook('ahrahirani'), 'MAT');
});

test('getFirstAvailableAudioBook returns Genesis for a full-bible translation with no per-book restriction', () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'fullbible') {
      return null;
    }

    return {
      id: 'fullbible',
      hasAudio: true,
      audio: {
        strategy: 'stream-template',
        baseUrl: 'audio/fullbible/v1',
        chapterPathTemplate: 'chapters/{bookId}/{chapter}.mp3',
      },
    };
  });

  assert.equal(getFirstAvailableAudioBook('fullbible'), 'GEN');
});

test('getFirstAvailableAudioBook returns null when the translation has no audio', () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'textonly') {
      return null;
    }

    return { id: 'textonly', hasAudio: false };
  });

  assert.equal(getFirstAvailableAudioBook('textonly'), null);
});
