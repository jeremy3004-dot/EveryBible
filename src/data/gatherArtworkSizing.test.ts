import test from 'node:test';
import assert from 'node:assert/strict';

import { GATHER_ARTWORK_ZOOM_OVERRIDES, getGatherArtworkZoom } from './gatherArtworkSizing';

test('Gather artwork zoom overrides stay restrained for centered card artwork', () => {
  assert.ok(
    getGatherArtworkZoom('foundation-1') > 1,
    'foundation-1 can keep a small emphasis boost'
  );

  for (const key of [
    'topic-courage',
    'topic-faith',
    'topic-hope',
    'topic-justice',
    'topic-love',
    'topic-obedience',
    'topic-anger',
    'topic-crisis',
    'topic-grief',
    'topic-hurt',
    'topic-known-and-loved',
    'topic-stress',
    'topic-character-of-god',
    'topic-marriage',
    'topic-parenting',
    'topic-singles',
    'topic-youth',
  ]) {
    assert.equal(getGatherArtworkZoom(key), 1, `${key} should render at natural scale in the card`);
  }

  assert.equal(
    getGatherArtworkZoom('topic-women') < 1,
    true,
    'topic-women should be scaled down slightly to avoid clipping at the top edge'
  );

  assert.equal(
    getGatherArtworkZoom('topic-money-advice') < 1,
    true,
    'topic-money-advice should be scaled down slightly to avoid clipping near the top edge'
  );

  assert.deepEqual(
    Object.keys(GATHER_ARTWORK_ZOOM_OVERRIDES).sort(),
    ['foundation-1', 'topic-money-advice', 'topic-women']
  );
});
