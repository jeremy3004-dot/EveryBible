/**
 * The book icon vectors are ~290 KB of path strings, and the `constants` barrel
 * re-exports bookIcons. Importing the module (or the barrel) must not load the
 * table; drawing the first icon loads it once.
 *
 * Separate file: each test file runs in its own process, so the module cache starts
 * empty here.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const requireFromTest = createRequire(import.meta.url);
const vectorTable = fileURLToPath(
  new URL('./bookIconVectors.generated.json', import.meta.url).href
);
const isTableLoaded = () => Object.keys(requireFromTest.cache).includes(vectorTable);

test('importing the book icon module loads no vector table', async () => {
  await import('./bookIcons.js');

  assert.equal(isTableLoaded(), false);
});

test('the first icon lookup loads the table once and later lookups reuse it', async () => {
  const { getBookIcon } = await import('./bookIcons.js');

  const genesis = getBookIcon('GEN');
  assert.equal(isTableLoaded(), true);
  assert.equal(getBookIcon('gen'), genesis);
  assert.equal(genesis?.viewBox, '0 0 768 768');
});
