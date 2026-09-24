import test from 'node:test';
import assert from 'node:assert/strict';

import { gatherFoundations } from './gatherFoundations';
import { gatherWisdomCategories } from './gatherWisdom';
import { getGatherArtworkXml, hasGatherArtwork } from './gatherArtwork';

function collectArtworkKeys() {
  const keys = new Set<string>();

  for (const foundation of gatherFoundations) {
    if (foundation.iconImage) {
      keys.add(foundation.iconImage);
    }
  }

  for (const category of gatherWisdomCategories) {
    if (category.iconImage) {
      keys.add(category.iconImage);
    }

    for (const wisdom of category.wisdoms) {
      if (wisdom.iconImage) {
        keys.add(wisdom.iconImage);
      }
    }
  }

  return keys;
}

test('every Gather artwork key has generated SVG markup', () => {
  const artworkKeys = collectArtworkKeys();

  assert.ok(artworkKeys.size > 30, `expected the Gather artwork keys, got ${artworkKeys.size}`);
  for (const key of artworkKeys) {
    assert.equal(hasGatherArtwork(key), true, `missing generated SVG for ${key}`);
    assert.match(
      getGatherArtworkXml(key) ?? '',
      /<svg[\s>]/,
      `SVG markup for ${key} should include an <svg> root`
    );
  }
});

test('keys without generated artwork resolve to nothing', () => {
  for (const key of ['topic-unknown', 'toString', '__proto__', '']) {
    assert.equal(hasGatherArtwork(key), false, key);
    assert.equal(getGatherArtworkXml(key), undefined, key);
  }
});

test('generated Gather artwork registry is sourced from the scripts/gather-svg sources', () => {
  const registrySource = getGatherArtworkXml('foundation-1') ?? '';

  assert.ok(registrySource.includes('<svg'), 'registry should contain inline svg markup');
});

test('bitmap-backed wisdom artwork is sanitized before shipping to the app', () => {
  const courage = getGatherArtworkXml('topic-courage') ?? '';

  assert.equal(
    courage.includes('<filter'),
    false,
    'bitmap-backed artwork should strip Canva filter wrappers'
  );
  assert.equal(
    courage.includes('<mask'),
    false,
    'bitmap-backed artwork should strip Canva mask wrappers'
  );
  assert.equal(
    courage.includes('xlink:href'),
    false,
    'bitmap-backed artwork should use a simplified image wrapper'
  );
  assert.equal(
    courage.includes('data:image/png;base64,'),
    true,
    'bitmap-backed artwork should still embed an image payload'
  );
});
