// Interim source check (HomeScreen only): the Gather screens and GatherIconBadge are covered by render tests in this folder; delete this once src/screens/home/HomeScreen.render.test.tsx asserts each foundation card drawsArtwork(card, foundation.iconImage).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('HomeScreen draws each foundation card through the shared artwork badge', () => {
  const home = readRelativeSource('../home/HomeScreen.tsx');

  assert.equal(
    home.includes('artworkKey={foundation.iconImage}'),
    true,
    'HomeScreen should pass each visible foundation artwork key into GatherIconBadge'
  );
  assert.equal(
    home.includes('gatherCategoryIcons'),
    false,
    'HomeScreen should not depend on the old icon-name registry'
  );
});
