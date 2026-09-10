import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { BibleTranslation, TranslationAudioCatalog } from '../../types';

// ---------------------------------------------------------------------------
// Mock configuration (one per file)
//
// audioRemote reads EXPO_PUBLIC_BIBLE_IS_API_KEY at import time, so the Bible.is
// branch is only reachable when the runtime config carries a key. The asset base
// URL is left unset so relative catalog references resolve against the production
// default (https://media.everybible.app), matching a shipped install.
// ---------------------------------------------------------------------------

const BIBLE_IS_KEY = 'test-bible-is-key';

mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_BIBLE_ASSET_BASE_URL: undefined,
    EXPO_PUBLIC_GEO_WORKER_URL: undefined,
    EXPO_PUBLIC_SUPABASE_URL: undefined,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: undefined,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: undefined,
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: undefined,
    EXPO_PUBLIC_BIBLE_IS_API_KEY: BIBLE_IS_KEY,
    EXPO_PUBLIC_CONTENT_API_URL: undefined,
    EXPO_PUBLIC_EL_MEDIA_BASE_URL: undefined,
  },
  buildPublicRuntimeConfig: () => ({}),
});

// ---------------------------------------------------------------------------
// Scriptable fetch + silenced console
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

const fetchCalls: FetchCall[] = [];
let fetchHandler: (url: string, init: RequestInit | undefined) => Promise<unknown> = async () => {
  throw new Error('fetch was not scripted for this test');
};

const realFetch = globalThis.fetch;
// Records the module's own abort-budget timers so leaks are observable.
const pendingTimeouts = new Set<unknown>();
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const consoleOutput: Array<{ level: 'warn' | 'error'; args: unknown[] }> = [];
const realWarn = console.warn;
const realError = console.error;

before(() => {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });
    return fetchHandler(url, init);
  }) as typeof globalThis.fetch;
  console.warn = (...args: unknown[]) => {
    consoleOutput.push({ level: 'warn', args });
  };
  console.error = (...args: unknown[]) => {
    consoleOutput.push({ level: 'error', args });
  };
  globalThis.setTimeout = ((handler: () => void, timeout?: number, ...args: unknown[]) => {
    const id = (realSetTimeout as (...a: unknown[]) => unknown)(handler, timeout, ...args);
    pendingTimeouts.add(id);
    return id;
  }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = ((id?: unknown) => {
    pendingTimeouts.delete(id);
    return (realClearTimeout as (...a: unknown[]) => void)(id);
  }) as typeof globalThis.clearTimeout;
});

test.after(() => {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  console.warn = realWarn;
  console.error = realError;
});

type AudioRemoteModule = typeof import('./audioRemote');
let mod: AudioRemoteModule;

before(async () => {
  mod = await import('./audioRemote');
});

beforeEach(() => {
  for (const id of pendingTimeouts) {
    realClearTimeout(id as ReturnType<typeof setTimeout>);
  }
  pendingTimeouts.clear();
  fetchCalls.length = 0;
  consoleOutput.length = 0;
  fetchHandler = async () => {
    throw new Error('fetch was not scripted for this test');
  };
});

afterEach(() => {
  mod.clearRemoteAudioCache();
  mod.setRemoteAudioMetadataResolver(null);
  mod.setElManifestChapterResolverForTests(null);
});

// ---------------------------------------------------------------------------
// Translation fixtures
// ---------------------------------------------------------------------------

function makeTranslation(overrides: Partial<BibleTranslation> & { id: string }): BibleTranslation {
  return {
    name: 'Test Translation',
    abbreviation: 'TST',
    language: 'en',
    description: '',
    copyright: '',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 0,
    hasText: true,
    hasAudio: true,
    audioGranularity: 'chapter',
    ...overrides,
  };
}

function withCatalogAudio(
  id: string,
  audio: TranslationAudioCatalog,
  overrides: Partial<BibleTranslation> = {}
): BibleTranslation {
  return makeTranslation({
    id,
    ...overrides,
    catalog: { version: '1', updatedAt: '2026-01-01T00:00:00.000Z', audio },
  });
}

/** Installs the production catalog mapper over a hand-built translation list. */
function useTranslations(...translations: BibleTranslation[]): void {
  mod.setRemoteAudioMetadataResolver(
    mod.createRemoteAudioMetadataResolverFromTranslations(translations)
  );
}

// ---------------------------------------------------------------------------
// Catalog -> metadata mapping
// ---------------------------------------------------------------------------

test('a translation flagged without audio is reported as having none', async () => {
  useTranslations(makeTranslation({ id: 'txt', hasAudio: false }));

  assert.equal(mod.hasConfiguredTranslationAudio('txt'), false);
  assert.equal(mod.isRemoteAudioAvailable('txt'), false);
  assert.equal(await mod.fetchRemoteChapterAudio('txt', 'GEN', 1), null);
});

test('a stream-template catalog infers its file extension from the chapter path template', () => {
  useTranslations(
    withCatalogAudio('tpl', {
      strategy: 'stream-template',
      baseUrl: 'https://cdn.example.test/tpl',
      chapterPathTemplate: '{bookId}/{chapter}.opus',
    })
  );

  assert.equal(mod.getRemoteAudioFileExtension('tpl'), 'opus');
});

test('a declared file extension wins over the template and is normalised', () => {
  useTranslations(
    withCatalogAudio('tpl', {
      strategy: 'stream-template',
      fileExtension: '  .M4A ',
      baseUrl: 'https://cdn.example.test/tpl',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
    })
  );

  assert.equal(mod.getRemoteAudioFileExtension('tpl'), 'm4a');
});

test('a blank declared file extension falls back to the inferred one', () => {
  useTranslations(
    withCatalogAudio('tpl', {
      strategy: 'stream-template',
      fileExtension: '   ',
      baseUrl: 'https://cdn.example.test/tpl',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
    })
  );

  assert.equal(mod.getRemoteAudioFileExtension('tpl'), 'mp3');
});

test('an extensionless chapter template leaves the file extension at the mp3 default', () => {
  useTranslations(
    withCatalogAudio('tpl', {
      strategy: 'stream-template',
      baseUrl: 'https://cdn.example.test/tpl',
      chapterPathTemplate: 'chapters/{bookId}-{chapter}',
    })
  );

  assert.equal(mod.getRemoteAudioFileExtension('tpl'), 'mp3');
});

test('an ebible-webbe provider catalog is mp3 and streams from ebible.org', async () => {
  useTranslations(withCatalogAudio('web', { strategy: 'provider', provider: 'ebible-webbe' }));

  assert.equal(mod.getRemoteAudioFileExtension('web'), 'mp3');
  assert.deepEqual(await mod.fetchRemoteChapterAudio('web', 'MRK', 4), {
    url: 'https://ebible.org/eng-webbe/mp3/eng-webbe_071_MRK_04.mp3',
    duration: 0,
  });
});

test('a provider catalog carries the translation fileset id into Bible.is availability', () => {
  useTranslations(
    withCatalogAudio(
      'bis',
      { strategy: 'provider', provider: 'bible-is' },
      { audioFilesetId: 'ENGESVN2DA' }
    )
  );

  assert.equal(mod.isRemoteAudioAvailable('bis'), true);
});

test('a provider catalog without a fileset id is not remotely available', () => {
  useTranslations(withCatalogAudio('bis', { strategy: 'provider', provider: 'bible-is' }));

  assert.equal(mod.isRemoteAudioAvailable('bis'), false);
});

test('an audio-pack catalog resolves its relative download url against the media base', async () => {
  useTranslations(
    withCatalogAudio('pack', {
      strategy: 'audio-pack',
      downloadUrl: 'audio/packs/pack-v1.zip',
    })
  );

  assert.equal(mod.isRemoteAudioAvailable('pack'), true);
  assert.deepEqual(await mod.fetchRemoteChapterAudio('pack', 'GEN', 1), {
    url: 'https://media.everybible.app/audio/packs/pack-v1.zip',
    duration: 0,
  });
});

test('an audio-pack catalog infers its file extension from the download url', () => {
  useTranslations(
    withCatalogAudio('pack', {
      strategy: 'audio-pack',
      downloadUrl: 'https://cdn.example.test/pack-v1.m4b?token=abc',
    })
  );

  assert.equal(mod.getRemoteAudioFileExtension('pack'), 'm4b');
});

test('an audio-pack catalog with an unusable download url resolves to no audio', async () => {
  useTranslations(
    withCatalogAudio('pack', {
      strategy: 'audio-pack',
      downloadUrl: 'javascript:alert(1)',
    })
  );

  assert.equal(await mod.fetchRemoteChapterAudio('pack', 'GEN', 1), null);
});

test('an audio-pack catalog with no download url is not remotely available', () => {
  useTranslations(withCatalogAudio('pack', { strategy: 'audio-pack' }));

  assert.equal(mod.isRemoteAudioAvailable('pack'), false);
});

test('an el-manifest catalog defaults to mp3 when the catalog omits the extension', () => {
  useTranslations(
    withCatalogAudio('el', {
      strategy: 'el-manifest',
      manifestUrl: '/manifests/audio/el/v1.json',
      audioVersion: 'v1',
      catalogBaseUrl: 'https://media.example.test',
    })
  );

  assert.equal(mod.getRemoteAudioFileExtension('el'), 'mp3');
  assert.equal(mod.isRemoteAudioAvailable('el'), true);
});

test('an el-manifest catalog missing its audio version is not remotely available', async () => {
  useTranslations(
    withCatalogAudio('el', {
      strategy: 'el-manifest',
      manifestUrl: '/manifests/audio/el/v1.json',
      catalogBaseUrl: 'https://media.example.test',
    })
  );

  assert.equal(mod.isRemoteAudioAvailable('el'), false);
  assert.equal(await mod.fetchRemoteChapterAudio('el', 'JHN', 1), null);
});

test('a legacy audioProvider without a catalog still resolves as provider audio', async () => {
  useTranslations(makeTranslation({ id: 'legacy', audioProvider: 'ebible-webbe' }));

  assert.equal(mod.getRemoteAudioFileExtension('legacy'), 'mp3');
  assert.deepEqual(await mod.fetchRemoteChapterAudio('legacy', 'JUD', 1), {
    url: 'https://ebible.org/eng-webbe/mp3/eng-webbe_095_JUD_01.mp3',
    duration: 0,
  });
});

test('audio advertised with neither a catalog nor a provider yields no playable source', async () => {
  useTranslations(makeTranslation({ id: 'bare' }));

  assert.equal(mod.hasConfiguredTranslationAudio('bare'), true);
  assert.equal(mod.isRemoteAudioAvailable('bare'), false);
  assert.equal(await mod.fetchRemoteChapterAudio('bare', 'GEN', 1), null);
  assert.equal(mod.getFirstAvailableAudioBook('bare'), null);
});

test('an unrecognised catalog strategy falls through to bare metadata', () => {
  useTranslations(
    withCatalogAudio('odd', {
      strategy: 'unknown-strategy' as TranslationAudioCatalog['strategy'],
    })
  );

  assert.equal(mod.hasConfiguredTranslationAudio('odd'), true);
  assert.equal(mod.isRemoteAudioAvailable('odd'), false);
});

test('the configured granularity is carried through the catalog mapper', () => {
  useTranslations(
    withCatalogAudio(
      'verses',
      { strategy: 'provider', provider: 'ebible-webbe' },
      { audioGranularity: 'verse' }
    )
  );

  assert.equal(mod.getConfiguredAudioGranularity('verses'), 'verse');
});

test('an unknown translation reports chapter granularity by default', () => {
  useTranslations();

  assert.equal(mod.getConfiguredAudioGranularity('nope'), 'chapter');
});

test('a translation missing from the runtime list falls back to the bundled catalog', async () => {
  useTranslations(makeTranslation({ id: 'other', hasAudio: false }));

  assert.deepEqual(await mod.fetchRemoteChapterAudio('bsb', 'GEN', 1), {
    url: 'https://media.everybible.app/audio/bsb/GEN/1.m4a',
    duration: 0,
  });
});

test('syncing the resolver with translations installs it for later lookups', () => {
  mod.syncRemoteAudioMetadataResolverWithTranslations([
    withCatalogAudio('synced', { strategy: 'provider', provider: 'ebible-webbe' }),
  ]);

  assert.equal(mod.isRemoteAudioAvailable('synced'), true);
});

test('a resolver that throws degrades to no audio instead of propagating', async () => {
  mod.setRemoteAudioMetadataResolver(() => {
    throw new Error('catalog store exploded');
  });

  assert.equal(mod.hasConfiguredTranslationAudio('boom'), false);
  assert.equal(mod.isRemoteAudioAvailable('boom'), false);
  assert.equal(await mod.fetchRemoteChapterAudio('boom', 'GEN', 1), null);
  assert.equal(
    consoleOutput.filter((entry) => entry.level === 'warn').length >= 1,
    true,
    'the failure is logged for diagnostics'
  );
});

// ---------------------------------------------------------------------------
// Stream-template URL building
// ---------------------------------------------------------------------------

test('a verse-scoped stream template fills both the raw and padded verse tokens', async () => {
  useTranslations(
    withCatalogAudio(
      'tpl',
      {
        strategy: 'stream-template',
        baseUrl: 'https://cdn.example.test/tpl/',
        chapterPathTemplate: '/{bookId}/{chapterPadded}/{verse}-{versePadded}.mp3',
      },
      { audioGranularity: 'verse' }
    )
  );

  assert.deepEqual(await mod.fetchRemoteChapterAudio('tpl', 'JHN', 3, 16), {
    url: 'https://cdn.example.test/tpl/JHN/03/16-016.mp3',
    duration: 0,
  });
});

test('a stream template rejects a chapter that is not a positive integer', async () => {
  useTranslations(
    withCatalogAudio('tpl', {
      strategy: 'stream-template',
      baseUrl: 'https://cdn.example.test/tpl',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
    })
  );

  assert.equal(await mod.fetchRemoteChapterAudio('tpl', 'JHN', 0), null);
  assert.equal(await mod.fetchRemoteChapterAudio('tpl', 'JHN', 1.5), null);
});

test('a stream template with an unusable base url resolves to no audio', async () => {
  useTranslations(
    withCatalogAudio('tpl', {
      strategy: 'stream-template',
      baseUrl: 'data:audio/mp3;base64,AAAA',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
    })
  );

  assert.equal(await mod.fetchRemoteChapterAudio('tpl', 'JHN', 3), null);
});

test('a stream template with no chapter path template resolves to no audio', async () => {
  useTranslations(
    withCatalogAudio('tpl', {
      strategy: 'stream-template',
      baseUrl: 'https://cdn.example.test/tpl',
    })
  );

  assert.equal(mod.isRemoteAudioAvailable('tpl'), false);
  assert.equal(await mod.fetchRemoteChapterAudio('tpl', 'JHN', 3), null);
});

// ---------------------------------------------------------------------------
// eBible WEBBE provider
// ---------------------------------------------------------------------------

test('webbe psalms chapters use three-digit chapter numbering', async () => {
  useTranslations(withCatalogAudio('web', { strategy: 'provider', provider: 'ebible-webbe' }));

  assert.deepEqual(await mod.fetchRemoteChapterAudio('web', 'PSA', 23), {
    url: 'https://ebible.org/eng-webbe/mp3/eng-webbe_020_PSA_023.mp3',
    duration: 0,
  });
});

test('webbe audio for a book outside the fileset resolves to no audio', async () => {
  useTranslations(withCatalogAudio('web', { strategy: 'provider', provider: 'ebible-webbe' }));

  assert.equal(await mod.fetchRemoteChapterAudio('web', 'TOB', 1), null);
});

// ---------------------------------------------------------------------------
// Bible.is fallback
// ---------------------------------------------------------------------------

function useBibleIsTranslation(filesetId?: string): void {
  useTranslations(
    withCatalogAudio(
      'bis',
      { strategy: 'provider', provider: 'bible-is' },
      filesetId ? { audioFilesetId: filesetId } : {}
    )
  );
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('bible.is chapter audio resolves the first file and converts duration to milliseconds', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  fetchHandler = async () =>
    jsonResponse({
      data: [
        { path: 'https://cdn.bible.is/JHN/3.mp3', duration: 90, verse_start: 1, verse_end: 36 },
      ],
    });

  assert.deepEqual(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3), {
    url: 'https://cdn.bible.is/JHN/3.mp3',
    duration: 90000,
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    `https://4.dbt.io/api/bibles/filesets/ENGESVN2DA/JHN/3?v=4&key=${BIBLE_IS_KEY}`
  );
});

test('a verse request picks the bible.is file whose verse range contains it', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  fetchHandler = async () =>
    jsonResponse({
      data: [
        { path: 'https://cdn.bible.is/JHN/3-a.mp3', duration: 10, verse_start: 1, verse_end: 10 },
        { path: 'https://cdn.bible.is/JHN/3-b.mp3', duration: 20, verse_start: 11, verse_end: 36 },
      ],
    });

  assert.deepEqual(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3, 16), {
    url: 'https://cdn.bible.is/JHN/3-b.mp3',
    duration: 20000,
  });
});

test('a verse outside every bible.is range falls back to the first file', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  fetchHandler = async () =>
    jsonResponse({
      data: [
        { path: 'https://cdn.bible.is/JHN/3-a.mp3', duration: 10, verse_start: 1, verse_end: 10 },
      ],
    });

  assert.deepEqual(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3, 99), {
    url: 'https://cdn.bible.is/JHN/3-a.mp3',
    duration: 10000,
  });
});

test('an empty bible.is payload resolves to no audio and is not cached', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  fetchHandler = async () => jsonResponse({ data: [] });

  assert.equal(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3), null);
  assert.equal(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3), null);
  assert.equal(fetchCalls.length, 2, 'a null result is re-requested rather than cached');
});

test('a payload without a data array resolves to no audio', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  fetchHandler = async () => jsonResponse({});

  assert.equal(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3), null);
});

test('a bible.is error status resolves to no audio and is logged', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  fetchHandler = async () => jsonResponse({}, false, 503);

  assert.equal(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3), null);
  assert.equal(
    consoleOutput.some((entry) => entry.level === 'error' && String(entry.args[1]).includes('503')),
    true
  );
});

test('a bible.is network failure resolves to no audio', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  fetchHandler = async () => {
    throw new Error('offline');
  };

  assert.equal(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3), null);
});

test('the abort budget timer is cleared when the bible.is request fails', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  fetchHandler = async () => {
    throw new Error('offline');
  };

  await mod.fetchRemoteChapterAudio('bis', 'JHN', 3);

  assert.equal(pendingTimeouts.size, 0, 'a failed request must not leave its abort timer armed');
});

test('a provider without a fileset id never calls the bible.is API', async () => {
  useBibleIsTranslation();

  assert.equal(await mod.fetchRemoteChapterAudio('bis', 'JHN', 3), null);
  assert.equal(fetchCalls.length, 0);
});

test('a bible.is request is aborted once the fifteen second budget elapses', async () => {
  useBibleIsTranslation('ENGESVN2DA');
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let abortedDuringRequest = false;
    fetchHandler = (_url, init) =>
      new Promise((resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          abortedDuringRequest = true;
          reject(new Error('aborted'));
        });
      });

    const pending = mod.fetchRemoteChapterAudio('bis', 'JHN', 3);
    mock.timers.tick(15000);

    assert.equal(await pending, null);
    assert.equal(abortedDuringRequest, true);
  } finally {
    mock.timers.reset();
  }
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

function countingResolver(): { resolved: string[]; install: () => void } {
  const resolved: string[] = [];
  return {
    resolved,
    install: () => {
      mod.setRemoteAudioMetadataResolver((translationId) => {
        resolved.push(translationId);
        return {
          id: translationId,
          hasAudio: true,
          audio: {
            strategy: 'stream-template',
            baseUrl: 'https://cdn.example.test/cache',
            chapterPathTemplate: '{bookId}/{chapter}.mp3',
          },
        };
      });
    },
  };
}

test('a repeated chapter request is served from the cache without re-resolving metadata', async () => {
  const resolver = countingResolver();
  resolver.install();

  const first = await mod.fetchRemoteChapterAudio('cache', 'JHN', 3);
  const second = await mod.fetchRemoteChapterAudio('cache', 'JHN', 3);

  assert.deepEqual(second, first);
  assert.deepEqual(resolver.resolved, ['cache']);
});

test('chapter and verse requests are cached under separate keys', async () => {
  const resolver = countingResolver();
  resolver.install();

  await mod.fetchRemoteChapterAudio('cache', 'JHN', 3);
  await mod.fetchRemoteChapterAudio('cache', 'JHN', 3, 16);

  assert.deepEqual(resolver.resolved, ['cache', 'cache']);
});

test('clearing the cache forces the next request to resolve again', async () => {
  const resolver = countingResolver();
  resolver.install();

  await mod.fetchRemoteChapterAudio('cache', 'JHN', 3);
  mod.clearRemoteAudioCache();
  await mod.fetchRemoteChapterAudio('cache', 'JHN', 3);

  assert.deepEqual(resolver.resolved, ['cache', 'cache']);
});

test('installing a new metadata resolver invalidates cached chapter urls', async () => {
  mod.setRemoteAudioMetadataResolver(() => ({
    id: 'swap',
    hasAudio: true,
    audio: {
      strategy: 'stream-template',
      baseUrl: 'https://old.example.test',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
    },
  }));
  assert.deepEqual(await mod.fetchRemoteChapterAudio('swap', 'JHN', 3), {
    url: 'https://old.example.test/JHN/3.mp3',
    duration: 0,
  });

  mod.setRemoteAudioMetadataResolver(() => ({
    id: 'swap',
    hasAudio: true,
    audio: {
      strategy: 'stream-template',
      baseUrl: 'https://new.example.test',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
    },
  }));

  assert.deepEqual(await mod.fetchRemoteChapterAudio('swap', 'JHN', 3), {
    url: 'https://new.example.test/JHN/3.mp3',
    duration: 0,
  });
});

test('the oldest cache entry is evicted once the cache is full', async () => {
  const resolver = countingResolver();
  resolver.install();

  for (let chapter = 1; chapter <= 300; chapter += 1) {
    await mod.fetchRemoteChapterAudio('cache', 'PSA', chapter);
  }
  resolver.resolved.length = 0;

  // Entry 301 evicts chapter 1, so chapter 1 must resolve again while a
  // later entry stays cached.
  await mod.fetchRemoteChapterAudio('cache', 'PSA', 301);
  await mod.fetchRemoteChapterAudio('cache', 'PSA', 2);
  await mod.fetchRemoteChapterAudio('cache', 'PSA', 1);

  assert.deepEqual(resolver.resolved, ['cache', 'cache']);
});

test('prefetching warms the requested run of chapters', async () => {
  const resolver = countingResolver();
  resolver.install();

  await mod.prefetchRemoteChapterAudio('cache', 'JHN', 5);
  resolver.resolved.length = 0;

  assert.deepEqual(await mod.fetchRemoteChapterAudio('cache', 'JHN', 7), {
    url: 'https://cdn.example.test/cache/JHN/7.mp3',
    duration: 0,
  });
  assert.deepEqual(resolver.resolved, [], 'chapters 5-7 were already warmed');
});

test('prefetching skips chapters that are already cached', async () => {
  const resolver = countingResolver();
  resolver.install();

  await mod.fetchRemoteChapterAudio('cache', 'JHN', 5);
  resolver.resolved.length = 0;

  await mod.prefetchRemoteChapterAudio('cache', 'JHN', 5, 2);

  assert.deepEqual(resolver.resolved, ['cache'], 'only chapter 6 was fetched');
});

test('prefetching survives a translation whose audio cannot be resolved', async () => {
  mod.setRemoteAudioMetadataResolver(() => {
    throw new Error('catalog store exploded');
  });

  await assert.doesNotReject(() => mod.prefetchRemoteChapterAudio('boom', 'JHN', 1, 2));
});

// ---------------------------------------------------------------------------
// EL manifest chapter resolution
// ---------------------------------------------------------------------------

test('el-manifest chapter audio caches the resolved immutable url', async () => {
  useTranslations(
    withCatalogAudio('el', {
      strategy: 'el-manifest',
      manifestUrl: '/manifests/audio/el/v1.json',
      audioVersion: 'v1',
      catalogBaseUrl: 'https://media.example.test',
    })
  );
  let resolveCount = 0;
  mod.setElManifestChapterResolverForTests(async () => {
    resolveCount += 1;
    return {
      url: 'https://media.example.test/audio/el/JHN/3.mp3',
      mimeType: 'audio/mpeg',
      fileExt: 'mp3',
      bytes: 1234,
      durationMs: 42000,
    };
  });

  const first = await mod.fetchRemoteChapterAudio('el', 'JHN', 3);
  const second = await mod.fetchRemoteChapterAudio('el', 'JHN', 3);

  assert.deepEqual(first, {
    url: 'https://media.example.test/audio/el/JHN/3.mp3',
    duration: 42000,
  });
  assert.deepEqual(second, first);
  assert.equal(resolveCount, 1);
});

test('el-manifest chapter audio without a duration reports zero', async () => {
  useTranslations(
    withCatalogAudio('el', {
      strategy: 'el-manifest',
      manifestUrl: '/manifests/audio/el/v1.json',
      audioVersion: 'v1',
      catalogBaseUrl: 'https://media.example.test',
    })
  );
  mod.setElManifestChapterResolverForTests(async () => ({
    url: 'https://media.example.test/audio/el/JHN/3.mp3',
    mimeType: 'audio/mpeg',
    fileExt: 'mp3',
    bytes: 1234,
  }));

  assert.deepEqual(await mod.fetchRemoteChapterAudio('el', 'JHN', 3), {
    url: 'https://media.example.test/audio/el/JHN/3.mp3',
    duration: 0,
  });
});

// ---------------------------------------------------------------------------
// Book coverage
// ---------------------------------------------------------------------------

test('the first available audio book skips books outside an explicit book map', () => {
  useTranslations(
    withCatalogAudio('partial', {
      strategy: 'stream-template',
      books: { LUK: { totalChapters: 24 } },
      baseUrl: 'https://cdn.example.test/partial',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
    })
  );

  assert.equal(mod.getFirstAvailableAudioBook('partial'), 'LUK');
});

test('a book map naming no canonical book leaves no first available audio book', () => {
  useTranslations(
    withCatalogAudio('partial', {
      strategy: 'stream-template',
      books: { ZZZ: { totalChapters: 1 } },
      baseUrl: 'https://cdn.example.test/partial',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
    })
  );

  assert.equal(mod.getFirstAvailableAudioBook('partial'), null);
});
