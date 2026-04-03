import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRemoteAudioCache,
  fetchRemoteChapterAudio,
  getRemoteAudioFileExtension,
  isRemoteAudioAvailable,
  setRemoteAudioMetadataResolver,
} from './audioRemote';

test.afterEach(() => {
  clearRemoteAudioCache();
  setRemoteAudioMetadataResolver(null);
});

test('berean standard bible audio resolves through the EveryBible media route when Supabase base URL is not configured', async () => {
  const audio = await fetchRemoteChapterAudio('bsb', 'GEN', 1);

  assert.deepEqual(audio, {
    url: 'https://everybible.app/api/media/audio/bsb/GEN/1.m4a',
    duration: 0,
  });
});

test('berean standard bible audio resolves numbered-book chapters through the EveryBible media route', async () => {
  const audio = await fetchRemoteChapterAudio('bsb', '1CO', 13);

  assert.deepEqual(audio, {
    url: 'https://everybible.app/api/media/audio/bsb/1CO/13.m4a',
    duration: 0,
  });
});

test('berean standard bible audio resolves psalms chapters through the EveryBible media route', async () => {
  const audio = await fetchRemoteChapterAudio('bsb', 'PSA', 150);

  assert.deepEqual(audio, {
    url: 'https://everybible.app/api/media/audio/bsb/PSA/150.m4a',
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
    url: 'https://everybible.app/api/media/audio/web/GEN/1.mp3',
    duration: 0,
  });
});

test('world english bible audio supports psalms chapter filenames through the EveryBible media route', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'PSA', 150);

  assert.deepEqual(audio, {
    url: 'https://everybible.app/api/media/audio/web/PSA/150.mp3',
    duration: 0,
  });
});

test('world english bible audio resolves any direct chapter path the R2 catalog provides', async () => {
  const audio = await fetchRemoteChapterAudio('web', 'XXX', 1);

  assert.deepEqual(audio, {
    url: 'https://everybible.app/api/media/audio/web/XXX/1.mp3',
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
