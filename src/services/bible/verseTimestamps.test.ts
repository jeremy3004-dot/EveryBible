/**
 * Behavioural tests for the verseTimestamps service: bundled chapter lookup, the
 * remote stream-template path, and the JSON sanitising both share.
 *
 * The final suite loads every bundled chapter through the public lookup and compares it
 * with the generated source file, so a stale or malformed generated table fails.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { bibleBooks } from '../../constants/books';
import { assertDefined } from '../../utils/assertDefined';

type TimestampModule = typeof import('./verseTimestamps');

const TIMESTAMP_SOURCE_DIR = fileURLToPath(
  new URL('../../../assets/timestamps', import.meta.url).href
);

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
  // The bundled tables are code-generated from assets/timestamps by
  // scripts/codegen-timestamps.mjs. A missing or malformed entry is swallowed to null at
  // runtime, so check every chapter against the source file it was generated from.
  it('returns exactly the generated source timings for every BSB and WEB chapter', async () => {
    const { getChapterTimestamps } = await loadModule();
    const mismatched: string[] = [];
    let chapters = 0;

    for (const translation of ['BSB', 'WEB']) {
      const directory = path.join(TIMESTAMP_SOURCE_DIR, translation);
      for (const file of readdirSync(directory)) {
        if (!file.endsWith('.json') || file === 'manifest.json') {
          continue;
        }
        const match = /^(\w+)_(\d{3})\.json$/.exec(file);
        const bookId = assertDefined(match?.[1], `book id from ${file}`);
        const chapter = assertDefined(match?.[2], `chapter number from ${file}`);
        const source = JSON.parse(readFileSync(path.join(directory, file), 'utf8')) as Record<
          string,
          number
        >;
        const expected = Object.fromEntries(
          Object.entries(source).map(([verse, seconds]) => [Number(verse), seconds])
        );
        const actual = await getChapterTimestamps(
          translation.toLowerCase(),
          bookId,
          Number(chapter)
        );
        chapters += 1;
        if (!isDeepStrictEqual(actual, expected)) {
          mismatched.push(`${translation} ${file}`);
        }
      }
    }

    assert.deepEqual(mismatched, []);
    assert.equal(chapters, 2 * 1189);
  });

  it('covers every chapter of the Bible in both bundled translations', async () => {
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
