/**
 * bibleStore imports verseTimestamps during launch to keep its metadata resolver in
 * sync, so importing the service must not load the bundled timing tables (~200 KB
 * each). A table loads the first time a chapter of its translation is looked up.
 *
 * Separate file: each test file runs in its own process, so the module cache starts
 * empty here.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const requireFromTest = createRequire(import.meta.url);
const tablePath = (translation: string) =>
  fileURLToPath(
    new URL(`../../data/verseTimestamps.${translation}.generated.json`, import.meta.url).href
  );
const isLoaded = (translation: string) => tablePath(translation) in requireFromTest.cache;

test('importing the service and answering coverage questions loads no timing table', async () => {
  const module = await import('./verseTimestamps.js');

  module.syncVerseTimestampMetadataResolverWithTranslations([]);
  assert.equal(module.hasTimestampsForTranslation('bsb'), true);
  assert.equal(module.hasTimestampsForTranslation('npiulb'), false);

  assert.deepEqual([isLoaded('bsb'), isLoaded('web')], [false, false]);
});

test('looking up a chapter loads only that translation’s table', async () => {
  const { getChapterTimestamps } = await import('./verseTimestamps.js');

  const timestamps = await getChapterTimestamps('bsb', 'ACT', 8);

  assert.deepEqual([isLoaded('bsb'), isLoaded('web')], [true, false]);
  // Acts 8:37 has no timing in the source file; its neighbours do.
  assert.equal(typeof timestamps?.[36], 'number');
  assert.equal(timestamps?.[37], undefined);
  assert.equal(typeof timestamps?.[38], 'number');
});
