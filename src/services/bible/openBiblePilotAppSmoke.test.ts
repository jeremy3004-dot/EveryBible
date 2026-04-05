import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearRemoteAudioCache,
  fetchRemoteChapterAudio,
  setRemoteAudioMetadataResolver,
} from '../audio/audioRemote';
import {
  clearVerseTimestampCache,
  getChapterTimestamps,
  setVerseTimestampMetadataResolver,
} from './verseTimestamps';
import {
  buildOpenBiblePilotCatalog,
  type OpenBiblePilotRegistryTranslation,
} from './openBiblePilotModel';

const benbcv: OpenBiblePilotRegistryTranslation = {
  translationId: 'benbcv',
  name: 'Biblica Open Bengali Contemporary Version',
  abbreviation: 'BCV',
  sortOrder: 403,
  languageCode: 'ben',
  languageName: 'Bengali',
  textDirection: 'ltr',
  licenseType: 'public-domain',
  sourceUrl: 'https://open.bible',
  sourceExtIds: ['6351a4bea890a739e428d740'],
  audioCoverage: 'full-bible',
  timingMode: 'full-only',
  selected: true,
  status: 'planned',
  hasTextPack: false,
};

const npiulb: OpenBiblePilotRegistryTranslation = {
  translationId: 'npiulb',
  name: 'Nepali Unlocked Literal Bible (ULB)',
  abbreviation: 'NPB',
  sortOrder: 400,
  languageCode: 'npi',
  languageName: 'Nepali',
  textDirection: 'ltr',
  licenseType: 'public-domain',
  sourceUrl: 'https://open.bible',
  sourceExtIds: ['6311b8b12131fe7f0296b208'],
  audioCoverage: 'new-testament',
  timingMode: 'full-only',
  selected: true,
  status: 'planned',
  hasTextPack: true,
  textPackTranslationId: 'npiulb',
};

test.afterEach(() => {
  clearRemoteAudioCache();
  setRemoteAudioMetadataResolver(null);
  clearVerseTimestampCache();
  setVerseTimestampMetadataResolver(null);
});

test('pilot audio catalog resolves versioned EveryBible media urls for runtime audio-only translations', async () => {
  const catalog = buildOpenBiblePilotCatalog({
    translation: benbcv,
    version: '2026.04.05-open-bible-audio-v1',
    updatedAt: '2026-04-05T00:00:00.000Z',
    audioBooks: {
      JHN: { totalBytes: 1234, totalChapters: 21 },
    },
    totalAudioChapters: 21,
    totalTimingChapters: 21,
    textCatalog: null,
  });

  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'benbcv') {
      return null;
    }

    return {
      id: 'benbcv',
      hasAudio: true,
      fileExtension: 'mp3',
      audio: {
        strategy: 'stream-template',
        baseUrl: catalog.audio?.baseUrl ?? '',
        chapterPathTemplate: catalog.audio?.chapterPathTemplate ?? '',
      },
    };
  });

  const audio = await fetchRemoteChapterAudio('benbcv', 'JHN', 3);

  assert.deepEqual(audio, {
    url: 'https://everybible.app/api/media/audio/benbcv/2026.04.05-open-bible-audio-v1/chapters/JHN/3.mp3',
    duration: 0,
  });
});

test('pilot timing catalog resolves versioned EveryBible media urls for follow-along timing', async () => {
  const catalog = buildOpenBiblePilotCatalog({
    translation: npiulb,
    version: '2026.04.05-open-bible-audio-v1',
    updatedAt: '2026-04-05T00:00:00.000Z',
    audioBooks: {
      JHN: { totalBytes: 1234, totalChapters: 21 },
    },
    totalAudioChapters: 21,
    totalTimingChapters: 21,
    textCatalog: null,
  });

  setVerseTimestampMetadataResolver((translationId) => {
    if (translationId !== 'npiulb') {
      return null;
    }

    return {
      id: 'npiulb',
      hasTiming: true,
      timing: {
        strategy: 'stream-template',
        baseUrl: catalog.timing?.baseUrl ?? '',
        chapterPathTemplate: catalog.timing?.chapterPathTemplate ?? '',
      },
    };
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    assert.equal(
      String(input),
      'https://everybible.app/api/media/timing/npiulb/2026.04.05-open-bible-audio-v1/JHN/3.json'
    );

    return new Response(JSON.stringify({ '1': 0, '2': 4.2, '3': 9.8 }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    const result = await getChapterTimestamps('npiulb', 'JHN', 3);
    assert.deepEqual(result, { 1: 0, 2: 4.2, 3: 9.8 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
