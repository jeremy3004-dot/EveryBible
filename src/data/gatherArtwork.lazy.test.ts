/**
 * Home draws one small foundation mark through GatherIconBadge on its first render,
 * while the topic artworks embed PNG payloads (~750 KB together). Importing the
 * registry must load no artwork, and drawing one must load only that one.
 *
 * Separate file: each test file runs in its own process, so the module cache starts
 * empty here.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const requireFromTest = createRequire(import.meta.url);
const artworkDirectory = fileURLToPath(new URL('./gatherArtworkSvg/', import.meta.url).href);
const loadedArtworkFiles = () =>
  Object.keys(requireFromTest.cache)
    .filter((file) => file.startsWith(artworkDirectory))
    .map((file) => path.basename(file))
    .sort();

test('importing the registry and checking keys loads no artwork', async () => {
  const { hasGatherArtwork } = await import('./gatherArtwork.js');

  assert.equal(hasGatherArtwork('foundation-1'), true);
  assert.equal(hasGatherArtwork('topic-courage'), true);

  assert.deepEqual(loadedArtworkFiles(), []);
});

test('drawing one artwork loads only that artwork', async () => {
  const { getGatherArtworkXml } = await import('./gatherArtwork.js');

  const first = getGatherArtworkXml('foundation-1');
  const again = getGatherArtworkXml('foundation-1');

  assert.match(first ?? '', /^<svg[\s>]/);
  assert.equal(again, first);
  assert.deepEqual(loadedArtworkFiles(), ['foundation-1.json']);
});
