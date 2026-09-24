/**
 * Behavioural tests for the verseTimestamps service: bundled chapter lookup, the
 * remote stream-template path, and the JSON sanitising both share.
 *
 * The final suite loads every bundled chapter through the public lookup, so a
 * generated `require()` entry that points at a missing or malformed file fails.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { bibleBooks } from '../../constants/books';

type TimestampModule = typeof import('./verseTimestamps');

const loadModule = (): Promise<TimestampModule> => import('./verseTimestamps.js');

/** Point the module at a remote stream-template translation served by `body`. */
async function withRemoteTimestamps(
  body: unknown,
  run: (module: TimestampModule, requestedUrls: string[]) => Promise<void>
): Promise<void> {
  const module = await loadModule();
  module.setVerseTimestampMetadataResolver((translationId) =>
    translationId === 'npiulb'
      ? {
          id: 'npiulb',
          hasTiming: true,
          timing: {
            strategy: 'stream-template',
            baseUrl: 'https://cdn.example.com/verse-timestamps/npiulb',
            chapterPathTemplate: '{bookId}/{chapter}.json',
            fileExtension: 'json',
            mimeType: 'application/json',
          },
        }
      : null
  );

  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await run(module, requestedUrls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

afterEach(async () => {
  const module = await loadModule();
  module.clearVerseTimestampCache();
  module.setVerseTimestampMetadataResolver(null);
});

describe('verseTimestamps — bundled chapters', () => {
  it('reads the bundled timestamps shipped for a chapter', async () => {
    const { getChapterTimestamps } = await loadModule();

    const timestamps = await getChapterTimestamps('web', 'GEN', 1);

    assert.ok(timestamps, 'WEB Genesis 1 ships bundled timestamps');
    assert.equal(typeof timestamps[1], 'number');
    assert.ok(Object.keys(timestamps).length > 1);
  });

  it('matches the bundled chapter regardless of how the translation id is cased', async () => {
    const { getChapterTimestamps } = await loadModule();

    assert.deepEqual(
      await getChapterTimestamps('WEB', 'GEN', 1),
      await getChapterTimestamps('web', 'GEN', 1)
    );
  });

  it('pads the chapter number, so a three-digit chapter still resolves', async () => {
    const { getChapterTimestamps } = await loadModule();

    assert.ok(await getChapterTimestamps('web', 'PSA', 119));
  });

  it('returns null for unknown chapters', async () => {
    const { getChapterTimestamps } = await loadModule();

    assert.equal(await getChapterTimestamps('web', 'ZZZ', 999), null);
  });

  it('reports generated WEB and BSB timestamp coverage for common chapters', async () => {
    const { hasTimestampsForTranslation } = await loadModule();

    assert.equal(hasTimestampsForTranslation('web'), true);
    assert.equal(hasTimestampsForTranslation('bsb'), true);
    assert.equal(hasTimestampsForTranslation('npiulb'), false);
  });
});

describe('verseTimestamps — remote stream templates', () => {
  it('fetches remote timestamp JSON when runtime metadata advertises a timestamp template', async () => {
    await withRemoteTimestamps({ '1': 0, '2': 4.2, '3': 9.8 }, async (module, requestedUrls) => {
      const result = await module.getChapterTimestamps('npiulb', 'JHN', 3);

      assert.deepEqual(result, { 1: 0, 2: 4.2, 3: 9.8 });
      assert.deepEqual(requestedUrls, [
        'https://cdn.example.com/verse-timestamps/npiulb/JHN/3.json',
      ]);
      assert.equal(module.hasTimestampsForTranslation('npiulb'), true);
    });
  });

  it('caches a fetched chapter instead of asking the network twice', async () => {
    await withRemoteTimestamps({ '1': 0, '2': 4.2 }, async (module, requestedUrls) => {
      await module.getChapterTimestamps('npiulb', 'JHN', 3);
      await module.getChapterTimestamps('npiulb', 'JHN', 3);

      assert.equal(requestedUrls.length, 1);
    });
  });

  it('drops entries whose key is not a verse number or whose value is not a number', async () => {
    await withRemoteTimestamps(
      { '1': 0, bad: 4.2, '3': '9.8', '4': null, '5': 12.5 },
      async (module) => {
        assert.deepEqual(await module.getChapterTimestamps('npiulb', 'JHN', 3), { 1: 0, 5: 12.5 });
      }
    );
  });

  it('reports no timestamps when the fetched chapter holds no usable entry', async () => {
    await withRemoteTimestamps({}, async (module) => {
      assert.equal(await module.getChapterTimestamps('npiulb', 'JHN', 3), null);
    });
  });

  it('ignores a fetched payload that is not an object of verse entries', async () => {
    await withRemoteTimestamps([0, 4.2, 9.8], async (module) => {
      assert.equal(await module.getChapterTimestamps('npiulb', 'JHN', 3), null);
    });
  });
});

describe('verseTimestamps — every bundled chapter ships', () => {
  // The require() table is code-generated; each entry must load a real, well-formed file.
  // A missing or malformed asset is swallowed to null at runtime, so check every chapter.
  it('returns timestamps for every BSB and WEB chapter of the Bible', async () => {
    const { getChapterTimestamps } = await loadModule();
    const missing: string[] = [];

    for (const translationId of ['bsb', 'web']) {
      for (const book of bibleBooks) {
        for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
          if (!(await getChapterTimestamps(translationId, book.id, chapter))) {
            missing.push(`${translationId} ${book.id} ${chapter}`);
          }
        }
      }
    }

    assert.deepEqual(missing, []);
  });
});
